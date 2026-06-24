import { beforeEach, describe, expect, test } from "bun:test";
import { dispatchEvent, type DecodedEvent } from "../src/mappings/mappingHandlers";

const marketToken = "CCBUUSYZJTGVA6PYUNQDFPZFHTBZ2QSHOUO7YAGRQVA46T3ZLSIYULS4";
const handlerContract = "CDWOFIP4YQJGMCYAOWLSRBAWN2OTJUG2I5WOFC32O2TX2SRU56RWBE5C";
const account = "GBXRE3IOBATED5NREPWDFL5GGFL4UEOM2QRKAEWA25JIMUXYTKA74GNU";

type StoreBucket = Map<string, Record<string, unknown>>;

const buckets = new Map<string, StoreBucket>();
const logs: string[] = [];

beforeEach(() => {
  buckets.clear();
  logs.length = 0;

  (globalThis as Record<string, unknown>).store = {
    async set(entity: string, id: string, value: Record<string, unknown>) {
      bucket(entity).set(id, { ...value });
    },
    async get(entity: string, id: string) {
      return bucket(entity).get(id);
    },
    async getOneByField(entity: string, field: string, value: unknown) {
      return [...bucket(entity).values()].find((record) => record[field] === value);
    },
    async getByField(entity: string, field: string, value: unknown) {
      return [...bucket(entity).values()].filter((record) => record[field] === value);
    },
    async getByFields() {
      return [];
    },
    async remove(entity: string, id: string) {
      bucket(entity).delete(id);
    },
  };

  (globalThis as Record<string, unknown>).logger = {
    info(message: string) {
      logs.push(message);
    },
    warn(message: string) {
      logs.push(message);
    },
  };
});

describe("SO4 event dispatch", () => {
  test("indexes a market creation event idempotently", async () => {
    const event = so4Event("mkt_new", {
      market_token: marketToken,
      market: marketToken,
      creator: account,
      name: "TETH/TUSDC",
    });

    await dispatchEvent(event);
    await dispatchEvent(event);

    expect(records("Market")).toHaveLength(1);
    expect(records("MarketConfigSnapshot")).toHaveLength(1);
    expect(records("Market")[0].id).toBe(`market:${marketToken}`);
  });

  test("indexes deposit lifecycle updates by deterministic key", async () => {
    await dispatchEvent(so4Event("dep_crt", lifecyclePayload("dep-1")));
    await dispatchEvent(so4Event("dep_exe", lifecyclePayload("dep-1")));

    const [deposit] = records("Deposit");
    expect(records("Deposit")).toHaveLength(1);
    expect(deposit.id).toBe("deposit:dep-1");
    expect(deposit.status).toBe("EXECUTED");
    expect(deposit.createdLedger).toBe(100);
    expect(deposit.executedLedger).toBe(100);
  });

  test("indexes withdrawal lifecycle updates", async () => {
    await dispatchEvent(so4Event("wth_crt", lifecyclePayload("wth-1")));
    await dispatchEvent(so4Event("wth_can", lifecyclePayload("wth-1", { reason: "expired" })));

    const [withdrawal] = records("Withdrawal");
    expect(records("Withdrawal")).toHaveLength(1);
    expect(withdrawal.id).toBe("withdrawal:wth-1");
    expect(withdrawal.status).toBe("CANCELLED");
    expect(withdrawal.cancellationReason).toBe("expired");
  });

  test("indexes order lifecycle updates", async () => {
    await dispatchEvent(
      so4Event("ord_crt", lifecyclePayload("ord-1", { order_type: "MARKET", is_long: true })),
    );
    await dispatchEvent(
      so4Event("ord_upd", lifecyclePayload("ord-1", { order_type: "MARKET", acceptable_price: "2000" })),
    );

    const [order] = records("Order");
    expect(records("Order")).toHaveLength(1);
    expect(order.id).toBe("order:ord-1");
    expect(order.status).toBe("UPDATED");
    expect(order.isLong).toBe(true);
    expect(order.acceptablePrice).toBe("2000");
  });

  test("indexes position changes and current position state", async () => {
    await dispatchEvent(
      so4Event("pos_inc", {
        position_key: "pos-1",
        market: marketToken,
        account,
        collateral_token: marketToken,
        is_long: true,
        next_size_usd: "500000000000000000000000000000000",
      }),
    );

    expect(records("Position")).toHaveLength(1);
    expect(records("PositionChange")).toHaveLength(1);
    expect(records("Position")[0].id).toBe("position:pos-1");
    expect(records("PositionChange")[0].changeType).toBe("INCREASE");
  });

  test("indexes liquidation and ADL events", async () => {
    await dispatchEvent(
      so4Event("liq_exe", {
        liquidation_key: "liq-1",
        market: marketToken,
        account,
        liquidator: account,
        is_long: false,
      }),
    );
    await dispatchEvent(
      so4Event("adl_req", {
        adl_key: "adl-1",
        market: marketToken,
        account,
        is_long: true,
      }),
    );

    expect(records("Liquidation")[0].status).toBe("EXECUTED");
    expect(records("AdlEvent")[0].status).toBe("REQUESTED");
  });

  test("indexes fee and referral events", async () => {
    await dispatchEvent(so4Event("fee_clm", { key: "fee-1", account, amount: "42" }));
    await dispatchEvent(so4Event("ref_reg", { code: "STEINS", account }));
    await dispatchEvent(so4Event("ref_set", { trader: account, code: "STEINS", referrer: account }));

    expect(records("FeeClaim")[0].amount).toBe("42");
    expect(records("ReferralCode")[0].code).toBe("STEINS");
    expect(records("TraderReferral")[0].referralCodeId).toBe("referral:STEINS");
  });

  test("indexes token/faucet transfer-style events", async () => {
    await dispatchEvent(
      so4Event("transfer", {
        from: account,
        to: "GCFXWMLJTQG5DGOUBWH4WZRK45ZKQGZBIWOAZ5QIRDR5UPB7YAE5VEW3",
        amount: "1000",
      }, marketToken),
    );

    const [transfer] = records("MarketTokenTransfer");
    expect(transfer.id).toBe("token-event:event-transfer");
    expect(transfer.transferType).toBe("transfer");
    expect(transfer.amount).toBe("1000");
  });

  test("logs and skips unknown events", async () => {
    await dispatchEvent(so4Event("mystery", {}));

    expect(records("Market")).toHaveLength(0);
    expect(logs.some((message) => message.includes("Skipping unknown SO4 event"))).toBe(true);
  });
});

function so4Event(
  eventName: string,
  named: Record<string, string | boolean>,
  contractAddress = handlerContract,
): DecodedEvent {
  return {
    id: `event-${eventName}`,
    contractAddress,
    eventName,
    ledger: 100,
    timestamp: new Date("2026-06-24T12:00:00Z"),
    transactionHash: `tx-${eventName}`,
    topic: [],
    values: {
      list: Object.values(named),
      named,
    },
  };
}

function lifecyclePayload(
  key: string,
  extra: Record<string, string | boolean> = {},
): Record<string, string | boolean> {
  return {
    key,
    market: marketToken,
    account,
    receiver: account,
    amount: "100",
    ...extra,
  };
}

function records(entity: string): Record<string, unknown>[] {
  return [...bucket(entity).values()];
}

function bucket(entity: string): StoreBucket {
  let value = buckets.get(entity);
  if (!value) {
    value = new Map();
    buckets.set(entity, value);
  }
  return value;
}

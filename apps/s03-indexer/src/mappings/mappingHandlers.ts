import { MarketTokenTransfer } from "../types";
import { SorobanEvent } from "@subql/types-stellar";
import { xdr } from "@stellar/stellar-sdk";
import { Address, scValToBigInt } from "@stellar/stellar-base";

export async function handleEvent(event: SorobanEvent): Promise<void> {
  logger.info(
    `New SO4 contract event found at block ${event.ledger!.sequence.toString()}`,
  );

  // Token and market-token transfers use topic shape [event_name, from, to].
  // Amounts are stored as strings to preserve protocol-scale precision.
  if (event.topic.length < 3) {
    logger.info(`Event ${event.id} does not match transfer topic shape, skipping`);
    return;
  }

  const {
    topic: [eventName, from, to],
  } = event;

  // Check if the topic values are actually addresses before decoding
  // ScVal.switch() tells us the type - we need 'scvAddress' type
  const fromType = from.switch().name;
  const toType = to.switch().name;
  if (fromType !== 'scvAddress' || toType !== 'scvAddress') {
    logger.info(`Event topic is not an address type, skipping. from: ${fromType}, to: ${toType}`);
    return;
  }

  // Check if address types are supported (0 = accountId, 1 = contractId)
  // Skip if unsupported type (e.g., type 4 or others)
  const fromAddressType = from.address().switch().value;
  const toAddressType = to.address().switch().value;
  if (fromAddressType !== 0 && fromAddressType !== 1) {
    logger.info(`Unsupported from address type: ${fromAddressType}, skipping event`);
    return;
  }
  if (toAddressType !== 0 && toAddressType !== 1) {
    logger.info(`Unsupported to address type: ${toAddressType}, skipping event`);
    return;
  }

  const fromAccount = decodeAddress(from);
  const toAccount = decodeAddress(to);

  // Check if event.value is an integer type before converting
  const valueType = event.value.switch().name;
  const integerTypes = ['scvU32', 'scvI32', 'scvU64', 'scvI64', 'scvU128', 'scvI128', 'scvU256', 'scvI256'];
  if (!integerTypes.includes(valueType)) {
    logger.info(`Event value is not an integer type: ${valueType}, skipping event`);
    return;
  }

  const contractAddress = event.contractId ? Buffer.from(event.contractId.contractId()).toString('hex') : '';
  const transactionHash = getTransactionHash(event);
  const transfer = MarketTokenTransfer.create({
    id: event.id,
    contractAddress,
    from: fromAccount.toLowerCase(),
    to: toAccount.toLowerCase(),
    account: fromAccount.toLowerCase(),
    transferType: decodeTopicName(eventName),
    amount: scValToBigInt(event.value).toString(),
    ledger: event.ledger!.sequence,
    timestamp: new Date(event.ledgerClosedAt),
    transactionHash,
  });

  await transfer.save();
}

// scValToNative not works, temp solution
function decodeAddress(scVal: xdr.ScVal): string {
  const address = scVal.address();

  // Must check which arm of the union is set FIRST using switch()
  // Calling .accountId() or .contractId() directly throws if that arm isn't set
  // ScAddressType enum: 0 = accountId, 1 = contractId
  const addressType = address.switch().value;
  if (addressType === 0) {
    return Address.account(address.accountId().ed25519()).toString();
  } else if (addressType === 1) {
    return Address.contract(address.contractId() as unknown as Buffer).toString();
  }

  throw new Error(`Unknown address type: ${addressType}`);
}

function decodeTopicName(scVal: xdr.ScVal): string {
  const valueType = scVal.switch().name;
  if (valueType === "scvSymbol") {
    return scVal.sym().toString();
  }
  if (valueType === "scvString") {
    return scVal.str().toString();
  }
  return valueType;
}

function getTransactionHash(event: SorobanEvent): string | undefined {
  const maybeEvent = event as unknown as {
    transactionHash?: string;
    txHash?: string;
    transaction?: { hash?: string };
  };

  return maybeEvent.transactionHash ?? maybeEvent.txHash ?? maybeEvent.transaction?.hash;
}

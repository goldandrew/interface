import { describe, expect, it } from "vitest"
import { ORDER_EXECUTION_FROZEN_MESSAGE, parseSorobanError } from "./errors"

describe("parseSorobanError", () => {
  it("maps contract error tokens to user-facing messages", () => {
    expect(parseSorobanError({ message: "host invocation failed: ORDER_EXECUTION_FROZEN" })).toBe(
      ORDER_EXECUTION_FROZEN_MESSAGE,
    )
  })

  it("walks nested RPC error payloads", () => {
    expect(
      parseSorobanError({
        response: {
          data: '{"error":{"message":"tx_bad_seq"}}',
        },
      }),
    ).toBe("Transaction sequence is out of date. Refresh and try again.")
  })

  describe("RPC error code mapping with specificity", () => {
    describe("tx_bad_auth vs tx_bad_auth_extra", () => {
      it("maps tx_bad_auth to signature invalid message", () => {
        expect(parseSorobanError("tx_bad_auth")).toBe(
          "Transaction signature invalid. Try reconnecting your wallet.",
        )
      })

      it("maps tx_bad_auth_extra to unexpected signatures message (most specific wins)", () => {
        expect(parseSorobanError("tx_bad_auth_extra")).toBe(
          "Transaction contains unexpected signatures. Try reconnecting your wallet.",
        )
      })

      it("maps tx_bad_auth_extra in nested JSON payload", () => {
        const error = {
          response: {
            data: JSON.stringify({
              error: {
                code: -32600,
                message: "transaction submission failed",
                data: { extras: { result_xdr: "AAAAAAAAAmT//////////w==" }, reason: "tx_bad_auth_extra" },
              },
            }),
          },
        }
        expect(parseSorobanError(error)).toBe(
          "Transaction contains unexpected signatures. Try reconnecting your wallet.",
        )
      })

      it("maps tx_bad_auth_extra in Error with cause chain", () => {
        const rootCause = new Error("RPC Error: tx_bad_auth_extra detected")
        const intermediateError = new Error("Stellar RPC call failed", { cause: rootCause })
        const topLevelError = new Error("Transaction submission error", { cause: intermediateError })

        expect(parseSorobanError(topLevelError)).toBe(
          "Transaction contains unexpected signatures. Try reconnecting your wallet.",
        )
      })

      it("prioritizes tx_bad_auth_extra over tx_bad_auth when both are present", () => {
        // This tests that longer codes are checked first
        const error = "Error contains both tx_bad_auth and tx_bad_auth_extra codes"
        expect(parseSorobanError(error)).toBe(
          "Transaction contains unexpected signatures. Try reconnecting your wallet.",
        )
      })

      it("maps tx_bad_auth when only the shorter code is present", () => {
        const error = "Error: tx_bad_auth occurred"
        expect(parseSorobanError(error)).toBe(
          "Transaction signature invalid. Try reconnecting your wallet.",
        )
      })
    })

    describe("tx_insufficient_fee", () => {
      it("maps tx_insufficient_fee to fee too low message", () => {
        expect(parseSorobanError("tx_insufficient_fee")).toBe(
          "Transaction fee is too low. Try again with a higher fee.",
        )
      })

      it("maps tx_insufficient_fee in nested JSON string", () => {
        const jsonString = JSON.stringify({
          error: "tx_insufficient_fee",
          details: { fee_required: 10000, fee_provided: 5000 },
        })
        expect(parseSorobanError(jsonString)).toBe(
          "Transaction fee is too low. Try again with a higher fee.",
        )
      })

      it("maps tx_insufficient_fee in Error instance with nested JSON cause", () => {
        const jsonCause = JSON.stringify({ rpc_error: "tx_insufficient_fee", code: -32001 })
        const causeError = new Error(jsonCause)
        const mainError = new Error("Network request failed", { cause: causeError })

        expect(parseSorobanError(mainError)).toBe(
          "Transaction fee is too low. Try again with a higher fee.",
        )
      })

      it("maps tx_insufficient_fee in deeply nested JSON payload", () => {
        const nestedJson = {
          response: {
            data: JSON.stringify({
              errors: [
                {
                  message: JSON.stringify({
                    stellar: { error: "tx_insufficient_fee" },
                  }),
                },
              ],
            }),
          },
        }
        expect(parseSorobanError(nestedJson)).toBe(
          "Transaction fee is too low. Try again with a higher fee.",
        )
      })
    })

    describe("tx_insufficient_balance", () => {
      it("maps tx_insufficient_balance to balance too low message", () => {
        expect(parseSorobanError("tx_insufficient_balance")).toBe(
          "Wallet balance is too low to submit this transaction.",
        )
      })

      it("maps tx_insufficient_balance in Error with multiple causes", () => {
        const cause1 = new Error("Balance check failed")
        const cause2 = new Error("tx_insufficient_balance", { cause: cause1 })
        const topError = new Error("Submission failed", { cause: cause2 })

        expect(parseSorobanError(topError)).toBe(
          "Wallet balance is too low to submit this transaction.",
        )
      })

      it("maps tx_insufficient_balance in JSON within error message", () => {
        const error = {
          message: '{"status":"failed","reason":"tx_insufficient_balance","timestamp":1234567890}',
        }
        expect(parseSorobanError(error)).toBe(
          "Wallet balance is too low to submit this transaction.",
        )
      })

      it("maps tx_insufficient_balance with mixed casing", () => {
        // The implementation normalizes to lowercase, so this should still match
        const error = "Error: TX_INSUFFICIENT_BALANCE detected"
        expect(parseSorobanError(error)).toBe(
          "Wallet balance is too low to submit this transaction.",
        )
      })
    })

    describe("tx_too_early", () => {
      it("maps tx_too_early to submitted too early message", () => {
        expect(parseSorobanError("tx_too_early")).toBe(
          "Transaction submitted too early. Wait a moment and try again.",
        )
      })

      it("maps tx_too_early in nested Error chain with JSON", () => {
        const jsonData = JSON.stringify({ error_code: "tx_too_early", min_time: 1700000000 })
        const innerError = new Error(jsonData)
        const outerError = new Error("Time validation failed", { cause: innerError })

        expect(parseSorobanError(outerError)).toBe(
          "Transaction submitted too early. Wait a moment and try again.",
        )
      })

      it("maps tx_too_early in complex nested structure", () => {
        const error = {
          response: {
            status: 400,
            data: {
              error: JSON.stringify({
                type: "timebounds",
                message: "tx_too_early",
              }),
            },
          },
        }
        expect(parseSorobanError(error)).toBe(
          "Transaction submitted too early. Wait a moment and try again.",
        )
      })
    })

    describe("tx_too_late", () => {
      it("maps tx_too_late to transaction expired message", () => {
        expect(parseSorobanError("tx_too_late")).toBe("Transaction expired. Please try again.")
      })

      it("maps tx_too_late in Error with cause", () => {
        const causeError = new Error("Timebounds validation: tx_too_late")
        const mainError = new Error("Transaction rejected", { cause: causeError })

        expect(parseSorobanError(mainError)).toBe("Transaction expired. Please try again.")
      })

      it("maps tx_too_late in JSON array", () => {
        const jsonString = JSON.stringify({
          errors: ["tx_too_late", "sequence_invalid"],
        })
        expect(parseSorobanError(jsonString)).toBe("Transaction expired. Please try again.")
      })

      it("maps tx_too_late in deeply nested cause chain", () => {
        const cause3 = new Error("RPC: tx_too_late")
        const cause2 = new Error("Network error", { cause: cause3 })
        const cause1 = new Error("Request failed", { cause: cause2 })
        const topError = new Error("API call failed", { cause: cause1 })

        expect(parseSorobanError(topError)).toBe("Transaction expired. Please try again.")
      })
    })

    describe("deterministic mapping with substring overlaps", () => {
      it("handles errors containing multiple RPC codes by prioritizing longest match", () => {
        // When multiple codes match, the longest one should win due to sortedErrorMessages
        const errorWithMultiple = "Error: tx_bad_auth_extra and tx_bad_auth both failed"
        expect(parseSorobanError(errorWithMultiple)).toBe(
          "Transaction contains unexpected signatures. Try reconnecting your wallet.",
        )
      })

      it("correctly maps when shorter code appears first in text", () => {
        const error = "tx_bad_auth occurred, but also tx_bad_auth_extra"
        // Should still map to the longer, more specific code
        expect(parseSorobanError(error)).toBe(
          "Transaction contains unexpected signatures. Try reconnecting your wallet.",
        )
      })

      it("handles edge case where substring appears as part of longer code only", () => {
        const error = "Error: tx_bad_auth_extra_info"
        // Should match tx_bad_auth_extra as substring
        expect(parseSorobanError(error)).toBe(
          "Transaction contains unexpected signatures. Try reconnecting your wallet.",
        )
      })

      it("maintains deterministic ordering across multiple runs", () => {
        // Run the same error multiple times to ensure consistency
        const error = "tx_insufficient_balance tx_insufficient_fee tx_bad_auth_extra"
        const results = Array.from({ length: 5 }, () => parseSorobanError(error))

        // All results should be identical
        expect(new Set(results).size).toBe(1)
        // Should map to longest code (tx_bad_auth_extra or tx_insufficient_balance/fee - all same length)
        // Due to sorted order, one specific message should consistently win
        expect(results[0]).toMatch(/Transaction|Wallet balance/)
      })
    })

    describe("error instances with complex structures", () => {
      it("handles Error with JSON in message and JSON in cause", () => {
        const causeJson = JSON.stringify({ error: "tx_bad_auth_extra" })
        const cause = new Error(causeJson)
        const messageJson = JSON.stringify({ status: "failed" })
        const error = new Error(messageJson, { cause })

        expect(parseSorobanError(error)).toBe(
          "Transaction contains unexpected signatures. Try reconnecting your wallet.",
        )
      })

      it("handles circular reference protection with RPC errors", () => {
        const obj: any = { message: "tx_insufficient_fee" }
        obj.self = obj // Create circular reference

        // Should not throw and should still find the error
        expect(parseSorobanError(obj)).toBe(
          "Transaction fee is too low. Try again with a higher fee.",
        )
      })

      it("handles array of errors with RPC codes", () => {
        const errors = [
          new Error("First error"),
          new Error("tx_too_early"),
          new Error("Third error"),
        ]
        expect(parseSorobanError(errors)).toBe(
          "Transaction submitted too early. Wait a moment and try again.",
        )
      })

      it("handles object with multiple error properties", () => {
        const error = {
          primary: "Some error",
          secondary: { message: "tx_too_late" },
          details: "Additional info",
        }
        expect(parseSorobanError(error)).toBe("Transaction expired. Please try again.")
      })
    })

    describe("edge cases and normalization", () => {
      it("handles RPC error code with surrounding whitespace", () => {
        const error = "  tx_insufficient_balance  "
        expect(parseSorobanError(error)).toBe(
          "Wallet balance is too low to submit this transaction.",
        )
      })

      it("handles RPC error code in JSON with escaped characters", () => {
        const jsonString = '{"error":"tx_bad_auth\\nAdditional context"}'
        expect(parseSorobanError(jsonString)).toBe(
          "Transaction signature invalid. Try reconnecting your wallet.",
        )
      })

      it("handles null and undefined gracefully", () => {
        expect(parseSorobanError(null)).toBe("Transaction failed. Please try again.")
        expect(parseSorobanError(undefined)).toBe("Transaction failed. Please try again.")
      })

      it("handles empty string", () => {
        expect(parseSorobanError("")).toBe("Transaction failed. Please try again.")
      })

      it("handles non-error primitive values", () => {
        expect(parseSorobanError(12345)).toBe("Transaction failed. Please try again.")
        expect(parseSorobanError(true)).toBe("Transaction failed. Please try again.")
      })
    })
  })
})

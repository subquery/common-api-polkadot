import {SubstrateExtrinsic} from '@subql/types';
import {HistoryElement, HistoryTransfer} from "../types";
import {
    callFromProxy, callsFromBatch,
    getExtrinsicFee,
    extrinsicIdFromBlockAndIdx, isBatch, isProxy,
    isTransfer
} from "./helper";
import {CallBase} from "@polkadot/types/types/calls";
import {AnyTuple} from "@polkadot/types/types/codec";
import {Balance} from "@polkadot/types/interfaces";

export async function handleExtrinsicForHistoryElement(extrinsic: SubstrateExtrinsic): Promise<void> {
    const { isSigned } = extrinsic.extrinsic;
    if (isSigned) {
        let failedTransfers = findFailedTransferCalls(extrinsic)
        if (failedTransfers != null) {
            await saveFailedTransfers(failedTransfers, extrinsic)
        } else {
            await saveExtrinsic(extrinsic)
        }
    }
}

async function saveFailedTransfers(transfers: HistoryTransfer[], extrinsic: SubstrateExtrinsic): Promise<void> {
    let promises = transfers.map(transfer => {
        let extrinsicHash = extrinsic.extrinsic.hash.toString();
        let blockNumber = extrinsic.block.block.header.number.toNumber();
        let extrinsicIdx = extrinsic.idx
        let extrinsicId = extrinsicIdFromBlockAndIdx(blockNumber, extrinsicIdx)
        let blockTimestamp = extrinsic.block.timestamp

        const elementFrom = new HistoryElement(extrinsicId+`-from`);
        elementFrom.address = transfer.from
        elementFrom.blockNumber = blockNumber
        elementFrom.extrinsicHash = extrinsicHash
        elementFrom.extrinsicIdx = extrinsicIdx
        elementFrom.timestamp = blockTimestamp
        elementFrom.transfer = transfer

        const elementTo = new HistoryElement(extrinsicId+`-to`);
        elementTo.address = transfer.to
        elementTo.blockNumber = blockNumber
        elementTo.extrinsicHash = extrinsicHash
        elementTo.extrinsicIdx = extrinsicIdx
        elementTo.timestamp = blockTimestamp
        elementTo.transfer = transfer

        return [elementTo.save(), elementFrom.save()]
    })
    await Promise.allSettled(promises)
}

async function saveExtrinsic(extrinsic: SubstrateExtrinsic): Promise<void> {
    let blockNumber = extrinsic.block.block.header.number.toNumber();
    let extrinsicIdx = extrinsic.idx
    let extrinsicId = extrinsicIdFromBlockAndIdx(blockNumber, extrinsicIdx)

    const element = new HistoryElement(extrinsicId);
    element.address = extrinsic.extrinsic.signer.toString()
    element.blockNumber = extrinsic.block.block.header.number.toNumber()
    element.extrinsicHash = extrinsic.extrinsic.hash.toString()
    element.extrinsicIdx = extrinsicIdx
    element.timestamp = extrinsic.block.timestamp

    element.extrinsic = {
        hash: extrinsic.extrinsic.hash.toString(),
        module: extrinsic.extrinsic.method.section,
        call: extrinsic.extrinsic.method.method,
        success: extrinsic.success,
        fee: getExtrinsicFee(extrinsic).toString()
    }

    await element.save()
}

/// Success Transfer emits Transfer event that is handled at Transfers.ts handleTransfer()
function findFailedTransferCalls(extrinsic: SubstrateExtrinsic): HistoryTransfer[] | null {
    if (extrinsic.success) {
        return null;
    }

    let transferCallsArgs = determineTransferCallsArgs(extrinsic.extrinsic.method)
    if (transferCallsArgs.length == 0) {
        return null;
    }

    let sender = extrinsic.extrinsic.signer
    return transferCallsArgs.map(tuple => {
        let blockNumber = extrinsic.block.block.header.number.toNumber();
        return {
            extrinsicHash: extrinsic.extrinsic.hash.toString(),
            amount: tuple[1].toString(),
            from: sender.toString(),
            to: tuple[0],
            blockNumber: blockNumber,
            fee: getExtrinsicFee(extrinsic).toString(),
            eventIdx: -1,
            success: false
        }
    })
}

function determineTransferCallsArgs(causeCall: CallBase<AnyTuple>) : [string, bigint][] {
    if (isTransfer(causeCall)) {
        return [extractArgsFromTransfer(causeCall)]
    } else if (isBatch(causeCall)) {
        return callsFromBatch(causeCall)
            .map(call => {
                return determineTransferCallsArgs(call)
                    .map((value, index, array) => {
                        return value
                    })
            })
            .flat()
    } else if (isProxy(causeCall)) {
        let proxyCall = callFromProxy(causeCall)
        return determineTransferCallsArgs(proxyCall)
    } else {
        return []
    }
}

function extractArgsFromTransfer(call: CallBase<AnyTuple>): [string, bigint] {
    const [destinationAddress, amount] = call.args

    return [destinationAddress.toString(), (amount as Balance).toBigInt()]
}

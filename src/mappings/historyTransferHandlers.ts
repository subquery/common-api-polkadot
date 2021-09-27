import {HistoryElement} from '../types';
import {SubstrateEvent} from "@subql/types";
import {blockNumber, eventId, getExtrinsicFee} from "./helper";

export async function handleTransferForHistoryElement(event: SubstrateEvent): Promise<void> {
    const {event: {data: [from, to, ]}} = event;

    const elementFrom = new HistoryElement(eventId(event)+`-from`);
    elementFrom.address = from.toString()
    await populateTransfer(elementFrom, event)

    const elementTo = new HistoryElement(eventId(event)+`-to`);
    elementTo.address = to.toString()
    await populateTransfer(elementTo, event)
}

async function populateTransfer(element: HistoryElement, event: SubstrateEvent): Promise<void> {
    element.timestamp = event.block.timestamp
    element.blockNumber = blockNumber(event);

    var fee = "0";

    if (event.extrinsic !== undefined) {
        element.extrinsicHash = event.extrinsic.extrinsic.hash.toString();
        element.extrinsicIdx = event.extrinsic.idx;
        fee = getExtrinsicFee(event.extrinsic).toString()
    }

    const {event: {data: [from, to, amount]}} = event;
    element.transfer = {
        amount: amount.toString(),
        from: from.toString(),
        to: to.toString(),
        fee: fee,
        eventIdx: event.idx,
        success: true
    }
    await element.save();
}

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .. import hotkey

router = APIRouter(prefix="/hotkey", tags=["hotkey"])


@router.websocket("/ws")
async def hotkey_events(ws: WebSocket):
    """Pushes "flip" each time the global flip hotkey is pressed."""
    await ws.accept()
    queue = hotkey.subscribe()
    # the client never sends anything; receiving only notices the disconnect
    disconnected = asyncio.ensure_future(ws.receive())
    try:
        while True:
            next_event = asyncio.ensure_future(queue.get())
            done, _ = await asyncio.wait({next_event, disconnected}, return_when=asyncio.FIRST_COMPLETED)
            if disconnected in done:
                next_event.cancel()
                break
            await ws.send_text(next_event.result())
    except WebSocketDisconnect:
        pass
    finally:
        disconnected.cancel()
        hotkey.unsubscribe(queue)

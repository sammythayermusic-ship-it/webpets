// Posts a real left click (or a move) at a screen point through CGEvent, so a check can prove the
// window server routes the click where the app claims it does -- a click on the pet's transparent
// padding must land on whatever is behind it. Needs Accessibility permission for the calling process.
//
//   swiftc -O tools/mac/clickat.swift -o /tmp/clickat && /tmp/clickat <x> <y> [move|click|rightclick] [settleMs]
//
// The settle (default 150 ms) between the move and the press matters for WebPets: its Rust cursor
// poller flips `ignoresMouseEvents` every 50 ms, so a press that lands within that window after the
// cursor arrives over a hit region is routed as if the window were still click-through.
import Foundation
import CoreGraphics

let a = CommandLine.arguments
guard a.count >= 3, let x = Double(a[1]), let y = Double(a[2]) else {
    print("usage: clickat <x> <y> [move|click|rightclick]"); exit(2)
}
let mode = a.count >= 4 ? a[3] : "click"
let settleUs = UInt32((a.count >= 5 ? Double(a[4]) ?? 150 : 150) * 1000)
let p = CGPoint(x: x, y: y)
func post(_ type: CGEventType, _ button: CGMouseButton) {
    guard let e = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: p, mouseButton: button) else {
        print("CGEvent failed"); exit(1)
    }
    e.post(tap: .cghidEventTap)
}
post(.mouseMoved, .left)
usleep(settleUs)
switch mode {
case "move": break
case "rightclick":
    post(.rightMouseDown, .right); usleep(40_000); post(.rightMouseUp, .right)
default:
    post(.leftMouseDown, .left); usleep(40_000); post(.leftMouseUp, .left)
}
print("ok \(mode) at \(x),\(y)")

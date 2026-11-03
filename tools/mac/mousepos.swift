// Prints the cursor position in global top-left points ("x y"), the frame clickat.swift and
// winlist.swift use. Needs no permission. Recording scripts read it first and move the cursor back
// there when they finish.
//
//   swiftc -O tools/mac/mousepos.swift -o /tmp/mousepos && /tmp/mousepos

import CoreGraphics

let p = CGEvent(source: nil)!.location
print("\(Int(p.x)) \(Int(p.y))")

// Lists on-screen (and optionally off-screen) windows via CGWindowListCopyWindowInfo. Needs no
// permission. Prints one JSON object per line: owner, pid, window id, layer, alpha, bounds, onscreen.
//
//   swiftc -O tools/mac/winlist.swift -o /tmp/winlist && /tmp/winlist [owner-substring] [--all]
//
// Used by the health checks to find the WebPets window id for `screencapture -l<id>` and to prove
// its level and bounds without taking a screenshot of the whole desktop.
import Foundation
import CoreGraphics

let args = CommandLine.arguments.dropFirst()
let all = args.contains("--all")
let filter = args.first { !$0.hasPrefix("--") }
let opts: CGWindowListOption = all ? [.optionAll] : [.optionOnScreenOnly]
guard let list = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] else {
    FileHandle.standardError.write("CGWindowListCopyWindowInfo failed\n".data(using: .utf8)!)
    exit(1)
}
for w in list {
    let owner = w[kCGWindowOwnerName as String] as? String ?? ""
    if let f = filter, !owner.localizedCaseInsensitiveContains(f) { continue }
    let pid = w[kCGWindowOwnerPID as String] as? Int ?? -1
    let wid = w[kCGWindowNumber as String] as? Int ?? -1
    let layer = w[kCGWindowLayer as String] as? Int ?? 0
    let alpha = w[kCGWindowAlpha as String] as? Double ?? 1
    let onscreen = (w[kCGWindowIsOnscreen as String] as? Bool) ?? false
    let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
    let name = w[kCGWindowName as String] as? String ?? ""
    let x = b["X"] as? Double ?? 0, y = b["Y"] as? Double ?? 0, ww = b["Width"] as? Double ?? 0, hh = b["Height"] as? Double ?? 0
    let obj: [String: Any] = ["owner": owner, "pid": pid, "id": wid, "layer": layer, "alpha": alpha,
                              "onscreen": onscreen, "x": x, "y": y, "w": ww, "h": hh, "name": name]
    let data = try! JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
}

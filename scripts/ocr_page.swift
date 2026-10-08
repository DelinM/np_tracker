import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
if args.count < 2 {
    fputs("usage: ocr_page.swift image.png\n", stderr)
    exit(2)
}

let url = URL(fileURLWithPath: args[1])
guard let image = NSImage(contentsOf: url) else {
    fputs("could not read image\n", stderr)
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
let handler = VNImageRequestHandler(url: url, options: [:])
try handler.perform([request])

var rows: [[String: Any]] = []
for observation in request.results ?? [] {
    guard let candidate = observation.topCandidates(1).first else { continue }
    let box = observation.boundingBox
    rows.append([
        "text": candidate.string,
        "confidence": candidate.confidence,
        "x": box.origin.x,
        "y": box.origin.y,
        "w": box.size.width,
        "h": box.size.height,
    ])
}

let data = try JSONSerialization.data(withJSONObject: rows, options: [])
FileHandle.standardOutput.write(data)

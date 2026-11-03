#!/usr/bin/env python3
"""Validate actual visual-review coverage; this does not grant release acceptance.

Run only after the completed capture, generated sheets and four actual receipts:
  imon-python /tmp/luxury-ux-review-coverage.py --manifest <sheet-manifest.json> \
    --allocation <bound-plan.json> --receipt <root.json> --receipt <filters.json> \
    --receipt <navigation.json> --receipt <qa.json> --out <all-pages-coverage.json>
"""
from __future__ import annotations
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import struct
import sys

OWNERS = {"/root", "/root/filters_ux", "/root/navigation_motion", "/root/qa_interaction_audit"}
LEVEL = "scaled-structural-overview"
DECISIONS = {"no-blocker-observed", "findings-recorded"}
HASHES = {}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(file):
    file = Path(file).resolve(strict=True)
    if file not in HASHES:
        digest = hashlib.sha256()
        with file.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        HASHES[file] = digest.hexdigest()
    return HASHES[file]


def read(file):
    return json.loads(Path(file).read_text())


def resolved(value, base):
    path = Path(value)
    return (path if path.is_absolute() else base / path).resolve(strict=True)


def png_dimensions(file):
    with Path(file).open("rb") as stream:
        head = stream.read(24)
    require(len(head) == 24 and head[:8] == b"\x89PNG\r\n\x1a\n" and head[12:16] == b"IHDR", "Not a PNG: " + str(file))
    return dict(zip(("width", "height"), struct.unpack(">II", head[16:24])))


def timestamp(value, label):
    require(isinstance(value, str) and value, label + " needs an actual timestamp")
    require(datetime.fromisoformat(value.replace("Z", "+00:00")).tzinfo is not None, label + " needs a timezone")


def triple(item):
    return item["route"], item["viewportWidth"], item["state"]


def coverage_tuple(item):
    return (*triple(item), item["originalFile"], item["originalSha256"],
            round(float(item["scaleX"]), 12), round(float(item["scaleY"]), 12))


def placement_coverage(item):
    return {"route": item["route"], "viewportWidth": item["nativeDimensions"]["width"],
            "state": item["kind"], "originalFile": item["originalFile"],
            "originalSha256": item["originalSha256"], "scaleX": item["scaleX"], "scaleY": item["scaleY"]}


def verify(args):
    manifest_file = args.manifest.resolve(strict=True)
    allocation_file = args.allocation.resolve(strict=True)
    manifest, plan = read(manifest_file), read(allocation_file)
    report_file = Path(manifest["sourceReport"]).resolve(strict=True)
    report = read(report_file)
    capture_root, sheet_root = report_file.parent, manifest_file.parent
    require(sha(report_file) == manifest["sourceReportSha256"], "Capture report SHA mismatch")
    require(report["sourceHead"] == manifest["sourceHead"], "Manifest source HEAD mismatch")
    require(report.get("complete") and report.get("allCanonicalPages") and report.get("fullMatrix"),
            "Requires a completed unrestricted canonical-page capture")
    canonical = read(capture_root / "canonical-routes.json")
    routes = canonical["routes"]
    require(len(routes) == len(set(routes)) == canonical["count"] == 130, "Expected exactly 130 canonical routes")
    views = report["views"]
    expected_views = {(route, width, "no-preference") for route in routes for width in (390, 1440)}
    actual_views = {(view["route"], view["width"], view["motion"]) for view in views}
    planned_views = {(view["route"], view["width"], view["motion"]) for view in report["plannedViews"]}
    require(len(views) == len(report["plannedViews"]) == 260 and actual_views == planned_views == expected_views and all(v["complete"] for v in views),
            "Actual/planned canonical 260-view matrix is incomplete or duplicated")
    require(plan.get("captureSourceHead") == manifest["sourceHead"], "Allocation is not bound to this source HEAD")
    require(plan.get("sheetManifestSha256") == sha(manifest_file), "Allocation manifest SHA mismatch/unbound")
    require(resolved(plan["sheetManifestPath"], allocation_file.parent) == manifest_file, "Allocation manifest path mismatch")
    assignments = {item["owner"]: [s["file"] for s in item["sheets"]] for item in plan["assignments"]}
    require(set(assignments) == OWNERS and len(plan["assignments"]) == 4, "Expected the four assigned reviewers")

    frames = manifest["sourceFrames"]
    frame_by_file = {frame["originalFile"]: frame for frame in frames}
    expected_states = {(route, width, kind) for route in routes for width in (390, 1440) for kind in ("top", "full")}
    actual_states = {(frame["route"], frame["viewportWidth"], frame["kind"]) for frame in frames}
    require(len(frames) == len(frame_by_file) == 520 and actual_states == expected_states, "Expected 520 unique original states")
    shots = {shot["file"]: shot for shot in report["screenshots"] if shot["kind"] in ("top", "full")}
    require(set(shots) == set(frame_by_file), "Manifest originals differ from capture screenshots")
    by_view = {view["key"]: view for view in views}
    for name, frame in frame_by_file.items():
        file = resolved(frame["originalPath"], capture_root)
        require(file.is_relative_to(capture_root) and file == (capture_root / name).resolve(), "Original escapes capture: " + name)
        require(sha(file) == frame["originalSha256"] == shots[name]["sha256"], "Original SHA mismatch: " + name)
        require(png_dimensions(file) == frame["nativeDimensions"] and frame["nativeDimensions"]["width"] == frame["viewportWidth"], "Original dimensions mismatch: " + name)
        view = by_view[shots[name]["view"]]
        require(frame["view"] == view["key"] and frame["route"] == view["route"] and frame["viewportWidth"] == view["width"] and frame["kind"] == shots[name]["kind"], "Original route/width/state differs from capture: " + name)

    sheets = manifest["sheets"]
    sheet_by_file = {sheet["file"]: sheet for sheet in sheets}
    assigned_names = [name for names in assignments.values() for name in names]
    require(len(sheets) == len(sheet_by_file) == manifest["sheetCount"] == 90, "Expected 90 unique sheets")
    require(len(assigned_names) == len(set(assigned_names)) == 90 and set(assigned_names) == set(sheet_by_file),
            "Allocation and actual 90-sheet set differ")
    placement_files = []
    for name, sheet in sheet_by_file.items():
        file = resolved(name, sheet_root)
        require(file.is_relative_to(sheet_root), "Sheet escapes manifest directory: " + name)
        require(sha(file) == sheet["sha256"], "Sheet SHA mismatch: " + name)
        require(png_dimensions(file) == sheet["dimensions"], "Sheet dimensions mismatch: " + name)
        for item in sheet["placements"]:
            original = frame_by_file[item["originalFile"]]
            require(item["originalSha256"] == original["originalSha256"] and item["route"] == original["route"]
                    and item["kind"] == original["kind"] and item["view"] == original["view"]
                    and item["nativeDimensions"] == original["nativeDimensions"] and item["cropped"] is False,
                    "Placement identity mismatch: " + name)
            for axis in ("X", "Y"):
                dim = "width" if axis == "X" else "height"
                actual_scale = item["renderedDimensions"][dim] / item["nativeDimensions"][dim]
                require(0 < item["scale" + axis] <= 1 and abs(actual_scale - item["scale" + axis]) < 1e-12,
                        "Placement scale mismatch: " + name)
            require(item["position"]["x"] >= 0 and item["position"]["y"] >= 0 and item["position"]["x"] + item["renderedDimensions"]["width"] <= sheet["dimensions"]["width"] and item["position"]["y"] + item["renderedDimensions"]["height"] <= sheet["dimensions"]["height"], "Placement is clipped by sheet bounds: " + name)
            placement_files.append(item["originalFile"])
    require(Counter(placement_files) == Counter(frame_by_file.keys()), "520 original placements missing or duplicated")

    require(len(args.receipt) == 4, "Pass exactly four actual reviewer receipts")
    reviewed, native, findings, reviewers, receipt_bindings = {}, [], [], [], []
    seen_owners = set()
    for receipt_path in args.receipt:
        receipt_path = receipt_path.resolve(strict=True)
        receipt = read(receipt_path)
        owner = receipt["reviewer"]
        require(owner in OWNERS and owner not in seen_owners, "Unknown/duplicate reviewer: " + owner)
        seen_owners.add(owner)
        require(receipt.get("schemaVersion") == 1 and receipt["status"] == "complete-for-assigned-overviews",
                "Receipt is not an explicit completed overview review: " + owner)
        require(receipt.get("releaseAcceptance") is False, "Individual receipt must not grant release acceptance")
        timestamp(receipt.get("completedAt"), owner + " completedAt")
        require(bool(receipt.get("limitations")), "Missing scope limitations: " + owner)
        binding = receipt["captureBinding"]
        require(binding["sourceHead"] == manifest["sourceHead"]
                and binding["captureReportSha256"] == sha(report_file)
                and binding["sheetManifestSha256"] == sha(manifest_file), "Receipt capture/hash binding mismatch: " + owner)
        require(resolved(binding["captureReportPath"], receipt_path.parent) == report_file
                and resolved(binding["sheetManifestPath"], receipt_path.parent) == manifest_file,
                "Receipt capture paths mismatch: " + owner)
        allocation = receipt["allocationBinding"]
        require(allocation["planSha256"] == sha(allocation_file)
                and resolved(allocation["planPath"], receipt_path.parent) == allocation_file,
                "Receipt allocation binding mismatch: " + owner)
        require(Counter(allocation["assignedSheets"]) == Counter(assignments[owner]), "Receipt assignment changed: " + owner)
        finding_map = {item["id"]: item for item in receipt["findings"]}
        require(len(finding_map) == len(receipt["findings"]), "Duplicate finding IDs: " + owner)
        for item in finding_map.values():
            require(item["severity"] in {"blocker", "major", "minor", "observation"}
                    and item["status"] in {"open", "resolved", "not-a-defect"}
                    and item.get("observation") and item.get("evidence"), "Incomplete finding: " + owner)
            findings.append({"reviewer": owner, **item})
        owner_sheets, owner_states = [], set()
        for item in receipt["reviewedSheets"]:
            name = item["file"]
            require(name in assignments[owner] and name not in reviewed, "Unexpected/duplicate reviewed sheet: " + name)
            require(item.get("actuallyViewed") is True and item.get("decision") in DECISIONS,
                    "Missing explicit actual-view/decision: " + name)
            require(item["reviewLevel"] == LEVEL and item.get("method") and item.get("observations"),
                    "Missing overview review evidence: " + name)
            timestamp(item["viewedAt"], name + " viewedAt")
            require(item["sha256"] == sheet_by_file[name]["sha256"], "Reviewed sheet SHA mismatch: " + name)
            ids = item.get("findingIds", [])
            require(all(fid in finding_map for fid in ids), "Unknown sheet finding ID: " + name)
            require((item["decision"] == "findings-recorded") == bool(ids), "Decision/finding IDs disagree: " + name)
            expected = [placement_coverage(p) for p in sheet_by_file[name]["placements"]]
            require(Counter(map(coverage_tuple, item["overviewCoverage"])) == Counter(map(coverage_tuple, expected)),
                    "Declared sheet coverage differs from actual placements: " + name)
            states = {triple(p) for p in expected}
            owner_states.update(states)
            owner_sheets.append(name)
            reviewed[name] = {"reviewer": owner, "sha256": item["sha256"], "decision": item["decision"],
                              "reviewLevel": LEVEL, "viewedAt": item["viewedAt"], "states": sorted(states)}
        unread = sorted(set(assignments[owner]) - set(owner_sheets))
        require(not unread, "Unread assigned sheets for " + owner + ": " + ", ".join(unread))
        for item in receipt["nativeInspections"]:
            timestamp(item["viewedAt"], owner + " native viewedAt")
            require(item.get("method") and item.get("observations"), "Missing explicit native inspection evidence")
            file = resolved(item["file"], capture_root)
            require(file.name in frame_by_file, "Native inspection does not belong to this capture")
            original = frame_by_file[file.name]
            require(file == Path(original["originalPath"]).resolve() and item["sha256"] == sha(file),
                    "Native file/SHA mismatch")
            require((item["route"], item["viewportWidth"], item["state"]) ==
                    (original["route"], original["viewportWidth"], original["kind"]), "Native state identity mismatch")
            region = item["region"]
            if isinstance(region, dict):
                require(region["resized"] is False, "A native detail crop must not be resized")
                dims = original["nativeDimensions"]
                require(region["x"] >= 0 and region["y"] >= 0 and region["width"] > 0 and region["height"] > 0
                        and region["x"] + region["width"] <= dims["width"]
                        and region["y"] + region["height"] <= dims["height"], "Native crop exceeds original")
                crop = resolved(region["cropFile"], receipt_path.parent)
                require(region["cropSha256"] == sha(crop)
                        and png_dimensions(crop) == {"width": region["width"], "height": region["height"]},
                        "Native crop SHA/dimensions mismatch")
            else:
                require(region == ("entire viewport PNG" if original["kind"] == "top" else "entire original full PNG"),
                        "Native inspection region/kind mismatch")
            native.append({"reviewer": owner, "reviewLevel": "native-original-or-unresized-region", **item})
        declared = receipt["coverage"]
        require(declared["assignedSheetCount"] == len(assignments[owner])
                and declared["actualViewedSheetCount"] == len(owner_sheets)
                and declared["unreadSheets"] == unread
                and set(declared["overviewRoutes"]) == {s[0] for s in owner_states}
                and {triple(s) for s in declared["overviewRouteWidthStates"]} == owner_states
                and declared["nativeInspectionCount"] == len(receipt["nativeInspections"]), "Receipt counts disagree with actual records: " + owner)
        reviewers.append({"reviewer": owner, "actuallyViewedSheets": len(owner_sheets), "nativeInspections": len(receipt["nativeInspections"]),
                          "decisions": dict(Counter(reviewed[n]["decision"] for n in owner_sheets)), "unreadSheets": unread})
        receipt_bindings.append({"reviewer": owner, "path": str(receipt_path), "sha256": sha(receipt_path)})
    require(seen_owners == OWNERS and set(reviewed) == set(sheet_by_file), "The four actual reviews do not cover all 90 sheets")
    overview_states = {state for item in reviewed.values() for state in item["states"]}
    require(overview_states == expected_states, "Actual human overview does not cover every route/width/top/full state")
    return {"sourceHead": manifest["sourceHead"], "coverageComplete": True,
            "captureReport": {"path": str(report_file), "sha256": sha(report_file), "machineChecksPassed": report.get("machineChecksPassed")},
            "sheetManifest": {"path": str(manifest_file), "sha256": sha(manifest_file)},
            "allocation": {"path": str(allocation_file), "sha256": sha(allocation_file)},
            "receipts": receipt_bindings, "reviewers": reviewers,
            "overviewCoverage": {"reviewLevel": LEVEL, "actualViewedSheets": len(reviewed), "unreadSheets": [],
                                 "routes": len({s[0] for s in overview_states}), "routeWidthViews": len({s[:2] for s in overview_states}),
                                 "originalPNGStates": len(overview_states), "states": ["top", "full"], "reviewedSheets": reviewed},
            "nativeDetailCoverage": {"reviewLevel": "native-original-or-unresized-region", "actualInspections": len(native), "inspections": native},
            "findings": findings, "openFindings": [f for f in findings if f["status"] == "open"],
            "blockingOpenFindings": [f for f in findings if f["status"] == "open" and f["severity"] in {"blocker", "major"}]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--allocation", required=True, type=Path)
    parser.add_argument("--receipt", required=True, action="append", type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    out = args.out.resolve()
    if out.exists():
        parser.error("--out already exists; preserve earlier evidence instead of overwriting it")
    result = {"schemaVersion": 1, "createdAt": datetime.now(timezone.utc).isoformat(),
              "validatorSha256": sha(Path(__file__)), "accepted": False, "ownerSignoffRequired": True,
              "coverageComplete": False, "humanReview": "pending-owner-signoff",
              "limitations": ["Coverage follows explicit actual-view records and reviewer decisions; file existence alone is not human review.",
                              "All-route contact sheets are scaled structural overviews, not native-size inspection of every character or pixel.",
                              "Native detail coverage is limited to exactly the recorded files and unresized regions.",
                              "Hashes and dimensions bind evidence; the release owner must assess findings and current functional/public gates separately."]}
    code = 0
    try:
        result["sourceHead"] = read(args.manifest).get("sourceHead")
        result.update(verify(args))
        result["validationStatus"] = "valid-complete-overview-evidence"
    except (ValueError, KeyError, TypeError, OSError) as error:
        result["validationStatus"] = "invalid-or-incomplete-review-evidence"
        result["error"] = str(error)
        code = 2
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"file": str(out), "sha256": sha(out), "sourceHead": result.get("sourceHead"),
                      "coverageComplete": result["coverageComplete"], "accepted": False,
                      "validationStatus": result["validationStatus"], "error": result.get("error")}, ensure_ascii=False))
    return code


if __name__ == "__main__":
    sys.exit(main())

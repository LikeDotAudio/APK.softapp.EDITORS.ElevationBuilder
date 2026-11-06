# Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
# MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
"""The IfcOpenShell check of an exported rack (IFC-CORE-DELTAS racks-2 / power-3 VERIFY). Test-time only:
IfcOpenShell is LGPL and never vendored, never loaded by the page.

    python3 -I scripts/validate-ifc.py rack.ifc [more.ifc ...]

prints one JSON object per file:
  statements     ifcopenshell.validate with express_rules=True: every schema and where-rule finding
  pset_problems  every Pset_/Qto_ against the IFC4X3 templates and every APK_ set against apk_psets.py, by the
                 BIM repo's oracle (tools/ifc/oracle.py) when it is beside this app
  ids            apk-av.ids through ifctester: [name, passed, applicable, first reasons] per specification
  racks          per EquipmentRack: kit_report.walk's weight and APK_RackQuantities.LoadedGrossWeight, and per
                 device its StartUnit, Face and z (ifcopenshell.util.placement, relative to the rack)
  checks         every element the rack aggregates but its frame has APK_RackPosition.StartUnit and an
                 IfcRelDefinesByType; the frame is an IfcFurniture typed TECHNICALCABINET with APK_Rack.RackUnits;
                 z == FirstUnitHeight + (StartUnit - 1) x 44.45 mm within 0.01 mm; a REAR device is turned 180
                 degrees; nothing the rack aggregates is also contained in a space; LoadedGrossWeight == walk where it is stated
Exit status 1 when any file has a statement, a Pset problem, a failed structural IDS spec or a failed check.
"""
import json
import sys
from pathlib import Path

import ifcopenshell
import ifcopenshell.util.element as UE
import ifcopenshell.util.placement as UP
import ifcopenshell.validate

HERE = Path(__file__).resolve().parent
TOOLS = HERE.parents[4] / "POD.database/DATABASE.server.BIM/SRC/tools/ifc"
STRUCTURAL = ("Every space is part of a storey",)
RU_MM = 44.45


def _tools():
    if (TOOLS / "oracle.py").exists():
        sys.path.insert(0, str(TOOLS))
        import oracle  # noqa: E402
        import kit_report  # noqa: E402
        return oracle, kit_report
    return None, None


def statements(f):
    log = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(f, log, express_rules=True)
    return [str(s.get("message", s)) if isinstance(s, dict) else str(s) for s in log.statements]


def checks(f, kit_report):
    bad, racks = [], []
    contained = {e.id() for r in f.by_type("IfcRelContainedInSpatialStructure") for e in r.RelatedElements}
    for a in f.by_type("IfcElementAssembly"):
        if a.ObjectType != "EquipmentRack":
            continue
        parts = UE.get_parts(a) or []
        frames = [p for p in parts if p.is_a("IfcFurniture")]
        if len(frames) != 1:
            bad.append("rack %s aggregates %d frames" % (a.Name, len(frames)))
            continue
        frame = frames[0]
        ft = UE.get_type(frame)
        if ft is None or ft.PredefinedType != "TECHNICALCABINET":
            bad.append("rack %s: its frame is not typed TECHNICALCABINET" % a.Name)
        rk = UE.get_psets(frame).get("APK_Rack", {})
        if "RackUnits" not in rk:
            bad.append("rack %s: its frame has no APK_Rack.RackUnits" % a.Name)
        first = rk.get("FirstUnitHeight") or 0
        rack_m = UP.get_local_placement(a.ObjectPlacement)
        devices = []
        for p in parts:
            if p.id() in contained:
                bad.append("%s is aggregated in the rack AND contained in a space" % p.Name)
            if p == frame:
                continue
            pos = UE.get_psets(p).get("APK_RackPosition", {})
            if "StartUnit" not in pos:
                bad.append("%s: no APK_RackPosition.StartUnit" % p.Name)
                continue
            if UE.get_type(p) is None:
                bad.append("%s: no IfcRelDefinesByType" % p.Name)
            m = UP.get_local_placement(p.ObjectPlacement)
            rel = [[sum(rack_m[k][i] * m[k][j] for k in range(4)) for j in range(4)] for i in range(4)]  # rack_m^T m (rotation only)
            z = m[2][3] - rack_m[2][3]
            want = first + (pos["StartUnit"] - 1) * RU_MM
            if abs(z - want) > 0.01:
                bad.append("%s: z %.3f, want %.3f" % (p.Name, z, want))
            turned = rel[0][0] < -0.999
            if (pos.get("Face") == "REAR") != turned:
                bad.append("%s: face %s but turned %s" % (p.Name, pos.get("Face"), turned))
            devices.append({"name": p.Name, "class": p.is_a(), "start": pos["StartUnit"], "face": pos.get("Face"), "z": round(z, 3)})
        loaded = UE.get_psets(a, qtos_only=True).get("APK_RackQuantities", {}).get("LoadedGrossWeight")
        walked = kit_report.walk(a)[0] if kit_report else None
        # an unknown weight is not written (the roll-up: all parts unknown is unknown, never 0); kit_report sums
        # the known parts only, so it is held to the figure only where the roll-up states one
        if kit_report and loaded is not None and (walked is None or abs(walked - loaded) > 1e-6):
            bad.append("rack %s: LoadedGrossWeight %s, kit_report walk %s" % (a.Name, loaded, walked))
        racks.append({"name": a.Name, "tag": a.Tag, "walk": walked, "loaded": loaded, "devices": devices,
                      "rollup": UE.get_psets(a).get("APK_PowerRollup", {})})
    if not racks:
        bad.append("no EquipmentRack in the file")
    return bad, racks


def main(paths):
    oracle, kit_report = _tools()
    worst = 0
    for path in paths:
        f = ifcopenshell.open(path)
        st = statements(f)
        pp = oracle.pset_problems(f) if oracle else []
        ids_rows = [list(r) for r in oracle.ids_results(f)] if oracle else []
        ids_bad = [r for r in ids_rows if r[0] in STRUCTURAL and not r[1]]
        ck, racks = checks(f, kit_report)
        space = {s.Name: UE.get_psets(s).get("Pset_SpaceThermalLoad", {}) for s in f.by_type("IfcSpace")}
        print(json.dumps({"file": path, "schema": f.schema_identifier, "statements": len(st), "first": st[:5],
                          "pset_problems": pp, "ids": ids_rows, "racks": racks, "spaces": space, "checks": ck,
                          "oracle": bool(oracle)}, default=str))
        if st or pp or ck or ids_bad:
            worst = 1
    return worst


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

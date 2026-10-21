// Revit 外掛：選一個房間 → 匯出網頁版「磁磚放樣施工圖系統」的施工圖資料檔（JSON）
// 在 Revit「增益集 → 外部工具」執行；平面圖上先選房間（或執行後再點），存檔後用網頁「📂 匯入資料檔」打開。
// 讀取：房間邊界（完成面）、高度、邊界牆上的門窗。換算規則在 RoomExportModel.cs。
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Selection;

namespace TileSettingOut
{
    [Transaction(TransactionMode.ReadOnly)]
    public class ExportRoomCommand : IExternalCommand
    {
        const double FeetToCm = 30.48;

        // 只讓使用者點到房間
        class RoomFilter : ISelectionFilter
        {
            public bool AllowElement(Element e) { return e is Room; }
            public bool AllowReference(Reference r, XYZ p) { return false; }
        }

        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            UIDocument uidoc = commandData.Application.ActiveUIDocument;
            if (uidoc == null) { message = "請先打開專案"; return Result.Failed; }
            Document doc = uidoc.Document;

            Room room = uidoc.Selection.GetElementIds().Select(id => doc.GetElement(id)).OfType<Room>().FirstOrDefault();
            if (room == null)
            {
                try
                {
                    Reference r = uidoc.Selection.PickObject(ObjectType.Element, new RoomFilter(), "點選要匯出的房間（浴室）");
                    room = doc.GetElement(r) as Room;
                }
                catch (Autodesk.Revit.Exceptions.OperationCanceledException) { return Result.Cancelled; }
            }
            if (room == null || room.Area <= 0)
            {
                TaskDialog.Show("磁磚放樣", "這個房間沒有面積（沒有被牆圍起來），無法匯出。");
                return Result.Failed;
            }

            var model = new RoomExportModel
            {
                ProjectName = doc.ProjectInformation != null ? doc.ProjectInformation.Name : "",
                RoomName = ParamString(room, BuiltInParameter.ROOM_NAME),
                RoomNumber = ParamString(room, BuiltInParameter.ROOM_NUMBER),
                HeightCm = room.UnboundedHeight * FeetToCm
            };

            // 1. 房間邊界：取完成面（貼磚面）；第一圈是外框，曲線牆切成折線
            var opt = new SpatialElementBoundaryOptions { SpatialElementBoundaryLocation = SpatialElementBoundaryLocation.Finish };
            IList<IList<BoundarySegment>> loops = room.GetBoundarySegments(opt);
            if (loops == null || loops.Count == 0)
            {
                TaskDialog.Show("磁磚放樣", "讀不到房間邊界。");
                return Result.Failed;
            }
            var wallIds = new HashSet<ElementId>();
            foreach (BoundarySegment seg in loops[0])
            {
                Curve c = seg.GetCurve();
                IList<XYZ> pts = c is Line ? new List<XYZ> { c.GetEndPoint(0) } : c.Tessellate().Take(c.Tessellate().Count - 1).ToList();
                foreach (XYZ p in pts) model.Boundary.Add(new[] { p.X * FeetToCm, p.Y * FeetToCm });
                if (doc.GetElement(seg.ElementId) is Wall) wallIds.Add(seg.ElementId);
            }
            if (loops.Count > 1) model.Warnings.Add("房間裡有柱子或島（內圈邊界），目前只匯出外框");

            // 2. 邊界牆上的門窗
            double baseOffsetCm = ParamDouble(room, BuiltInParameter.ROOM_LOWER_OFFSET) * FeetToCm;
            var cats = new LogicalOrFilter(new ElementCategoryFilter(BuiltInCategory.OST_Doors), new ElementCategoryFilter(BuiltInCategory.OST_Windows));
            foreach (FamilyInstance fi in new FilteredElementCollector(doc).OfClass(typeof(FamilyInstance)).WherePasses(cats).Cast<FamilyInstance>())
            {
                if (fi.Host == null || !wallIds.Contains(fi.Host.Id)) continue;
                var lp = fi.Location as LocationPoint;
                if (lp == null) continue;
                bool isDoor = fi.Category.Id.Value == (long)BuiltInCategory.OST_Doors;
                double w = FirstDouble(fi, BuiltInParameter.DOOR_WIDTH, BuiltInParameter.WINDOW_WIDTH, BuiltInParameter.FAMILY_WIDTH_PARAM);
                double h = FirstDouble(fi, BuiltInParameter.DOOR_HEIGHT, BuiltInParameter.WINDOW_HEIGHT, BuiltInParameter.FAMILY_HEIGHT_PARAM);
                if (w <= 0 || h <= 0) { model.Warnings.Add($"「{fi.Name}」讀不到寬或高，已略過"); continue; }
                model.Openings.Add(new OpeningInput
                {
                    IsDoor = isDoor,
                    Name = (isDoor ? "門 " : "窗 ") + fi.Symbol.Name,
                    X = lp.Point.X * FeetToCm,
                    Y = lp.Point.Y * FeetToCm,
                    Width = w * FeetToCm,
                    Height = h * FeetToCm,
                    Sill = isDoor ? 0 : ParamDouble(fi, BuiltInParameter.INSTANCE_SILL_HEIGHT_PARAM) * FeetToCm - baseOffsetCm
                });
            }

            // 3. 存檔
            string json;
            try { json = model.ToJson(); }
            catch (Exception ex) { TaskDialog.Show("磁磚放樣", ex.Message); return Result.Failed; }

            using (var dlg = new System.Windows.Forms.SaveFileDialog
            {
                Title = "儲存施工圖資料檔",
                Filter = "施工圖資料檔 (*.json)|*.json",
                FileName = "tile-setting-out.json"
            })
            {
                if (dlg.ShowDialog() != System.Windows.Forms.DialogResult.OK) return Result.Cancelled;
                System.IO.File.WriteAllText(dlg.FileName, json, new System.Text.UTF8Encoding(false));
            }

            string note = model.Warnings.Count > 0 ? "\n\n請確認：\n・" + string.Join("\n・", model.Warnings) : "";
            TaskDialog.Show("磁磚放樣", $"已匯出「{model.RoomNumber} {model.RoomName}」：{model.Openings.Count} 個門窗。\n"
                + "到網頁版按「📂 匯入資料檔」打開，再設定磁磚尺寸與起磚點。" + note);
            return Result.Succeeded;
        }

        static string ParamString(Element e, BuiltInParameter bip)
        {
            Parameter p = e.get_Parameter(bip);
            return p != null ? (p.AsString() ?? "") : "";
        }

        static double ParamDouble(Element e, BuiltInParameter bip)
        {
            Parameter p = e.get_Parameter(bip);
            return p != null && p.StorageType == StorageType.Double ? p.AsDouble() : 0;
        }

        // 門窗寬高可能放在實例或類型參數，依序找第一個有值的
        static double FirstDouble(FamilyInstance fi, params BuiltInParameter[] bips)
        {
            foreach (BuiltInParameter bip in bips)
            {
                double v = ParamDouble(fi, bip);
                if (v > 0) return v;
                v = ParamDouble(fi.Symbol, bip);
                if (v > 0) return v;
            }
            return 0;
        }
    }
}

// 房間 → 施工圖資料檔（JSON）的換算，不依賴 Revit，可以單獨測試
// 座標約定跟網頁版一致（見 ../AGENTS.md）：單位 cm；平面 B 在上、D 在下、A 在左、C 在右；
// 立面是站在房間裡面向那面牆看，A、D 跟平面左右相反。
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace TileSettingOut
{
    public class OpeningInput
    {
        public bool IsDoor;
        public string Name;
        public double X, Y;        // 開口中心在平面上的位置（cm，Revit 專案座標，Y 往上）
        public double Width, Height;
        public double Sill;        // 窗台高（門是 0），由房間地面量（cm）
    }

    public class RoomExportModel
    {
        public string ProjectName = "";
        public string RoomName = "";
        public string RoomNumber = "";
        public double HeightCm;
        public List<double[]> Boundary = new List<double[]>();   // 房間外框頂點（cm，Revit 平面座標）
        public List<OpeningInput> Openings = new List<OpeningInput>();
        public List<string> Warnings = new List<string>();

        static string N(double v) { return Math.Round(v, 1).ToString("0.###", CultureInfo.InvariantCulture); }

        static string Q(string s)
        {
            var sb = new StringBuilder("\"");
            foreach (char c in s ?? "")
            {
                if (c == '"' || c == '\\') sb.Append('\\').Append(c);
                else if (c == '\n') sb.Append("\\n");
                else if (c < 0x20) sb.Append(' ');
                else sb.Append(c);
            }
            return sb.Append('"').ToString();
        }

        static double PolyArea(List<double[]> pts)
        {
            double a = 0;
            for (int i = 0; i < pts.Count; i++)
            {
                var p = pts[i]; var q = pts[(i + 1) % pts.Count];
                a += p[0] * q[1] - q[0] * p[1];
            }
            return Math.Abs(a) / 2;
        }

        // 一面牆的設定：起磚先靠左、由地起，磁磚尺寸到網頁再設
        static string Face(double w, double h)
        {
            return "{ \"fw\": " + N(w) + ", \"fh\": " + N(h) + ", \"dir\": \"H\", \"mode\": \"grid\", \"xalign\": \"left\", \"xoff\": 0, \"yalign\": \"bottom\", \"yoff\": 0 }";
        }

        // 開口在哪一面、距那一面左緣多遠（A、D 鏡像）
        public static void PlaceOpening(OpeningInput o, double minX, double minY, double maxX, double maxY, out string face, out double along)
        {
            double dTop = maxY - o.Y, dBottom = o.Y - minY, dLeft = o.X - minX, dRight = maxX - o.X;
            double best = Math.Min(Math.Min(dTop, dBottom), Math.Min(dLeft, dRight));
            if (best == dTop) { face = "B"; along = o.X - minX; }
            else if (best == dRight) { face = "C"; along = maxY - o.Y; }
            else if (best == dBottom) { face = "D"; along = maxX - o.X; }
            else { face = "A"; along = o.Y - minY; }
            along = Math.Max(0, along - o.Width / 2);
        }

        public string ToJson()
        {
            if (Boundary.Count < 3) throw new InvalidOperationException("房間沒有邊界（是不是沒有放在封閉的牆裡？）");
            double minX = Boundary.Min(p => p[0]), maxX = Boundary.Max(p => p[0]);
            double minY = Boundary.Min(p => p[1]), maxY = Boundary.Max(p => p[1]);
            double fw = maxX - minX, fh = maxY - minY;
            double H = HeightCm > 1 ? HeightCm : 280;
            if (HeightCm <= 1) Warnings.Add("房間高度讀不到，先用 280cm，請在網頁上改");

            var sb = new StringBuilder();
            sb.Append("{\n  \"format\": \"tile-setting-out\",\n  \"version\": 1,\n");
            sb.Append("  \"meta\": { \"project\": ").Append(Q(ProjectName))
              .Append(", \"drawingName\": ").Append(Q((RoomNumber + " " + RoomName).Trim()))
              .Append(", \"number\": ").Append(Q(RoomNumber)).Append(" },\n");
            sb.Append("  \"room\": { \"L\": ").Append(N(fh)).Append(", \"W\": ").Append(N(fw)).Append(", \"H\": ").Append(N(H)).Append(" },\n");

            // 四面牆：A、C 寬＝房間深，B、D 寬＝房間寬；地坪＝外接矩形，不是矩形時附上外框
            sb.Append("  \"faces\": {\n");
            sb.Append("    \"floor\": { \"fw\": ").Append(N(fw)).Append(", \"fh\": ").Append(N(fh))
              .Append(", \"dir\": \"H\", \"mode\": \"grid\", \"xalign\": \"left\", \"xoff\": 0, \"yalign\": \"bottom\", \"yoff\": 0");
            if (PolyArea(Boundary) < fw * fh - 1)
            {
                var pts = Boundary.Select(p => "[" + N(p[0] - minX) + ", " + N(maxY - p[1]) + "]");
                sb.Append(", \"outline\": [").Append(string.Join(", ", pts)).Append("]");
            }
            sb.Append(" },\n");
            sb.Append("    \"A\": ").Append(Face(fh, H)).Append(",\n");
            sb.Append("    \"B\": ").Append(Face(fw, H)).Append(",\n");
            sb.Append("    \"C\": ").Append(Face(fh, H)).Append(",\n");
            sb.Append("    \"D\": ").Append(Face(fw, H)).Append("\n  },\n");

            sb.Append("  \"openings\": [");
            var items = new List<string>();
            foreach (var o in Openings)
            {
                string face; double along;
                PlaceOpening(o, minX, minY, maxX, maxY, out face, out along);
                items.Add("\n    { \"kind\": " + Q(o.IsDoor ? "door" : "window") + ", \"name\": " + Q(o.Name) + ", \"face\": " + Q(face)
                  + ", \"w\": " + N(o.Width) + ", \"h\": " + N(o.Height) + ", \"x\": " + N(along) + ", \"y\": " + N(o.IsDoor ? 0 : o.Sill) + " }");
            }
            sb.Append(string.Join(",", items)).Append(items.Count > 0 ? "\n  ],\n" : "],\n");
            sb.Append("  \"column\": { \"on\": false }\n}\n");
            return sb.ToString();
        }
    }
}

import {
  BathroomFloorDecisionEvent,
  ErgonomicRule,
  FloorZone,
  InspectionItem,
  NegotiatorScenario,
  TradeCategory,
} from '../types/agent';

/**
 * 1. 溝通談判 Agent：常見現場棘手情境（統一全大寫命名 NEGOTIATOR_SCENARIOS）
 */
export const NEGOTIATOR_SCENARIOS: NegotiatorScenario[] = [
  {
    id: 'extra_cost',
    label: '業主想凹免費追加插座／層板',
    rawInput: '跟業主說水電已經封槽了，現在要多拉兩組專用迴路跟插座不是順便就能做，要重新打石跟補土，費用要加 6500 元，工期多 2 天。',
    contextHint: '管線已封槽後之變更追加',
  },
  {
    id: 'rework_carpentry',
    label: '木作窗簾盒尺寸跟圖不符請師傅改',
    rawInput: '主臥窗簾盒圖面標 18 公分，現場量只有 12 公分，蛇形簾軌道會卡住，請木工阿明師傅這週五前退後重釘。',
    contextHint: '現場尺寸不符圖面要求修正',
  },
  {
    id: 'delay_rain',
    label: '泥作防水因連日大雨需順延試水',
    rawInput: '這禮拜濕度太高，浴室彈性水泥還沒完全乾透，不能硬貼磁磚不然以後會澎共，泥作進度要往後順延 4 天。',
    contextHint: '品質把關導致之必要工期順延',
  },
  {
    id: 'neighbor_noise',
    label: '打除工程被樓下鄰居向管委會抗議',
    rawInput: '我們完全照大樓規定早上九點到十二點、下午一點半到五點施工，最吵的打除明天下午就結束了，請總幹事幫忙安撫三樓住戶。',
    contextHint: '大樓管委會與敦親睦鄰溝通',
  },
];

/**
 * 2. 老工務長 Agent：人體工學與空間底線尺寸勸退資料庫
 */
export const ERGONOMIC_RULES: ErgonomicRule[] = [
  {
    id: 'island_aisle',
    space: '餐廚空間',
    title: '中島與廚具檯面之間走道淨寬',
    unit: 'cm',
    minLimit: 75,
    comfortMin: 95,
    standard: 105,
    maxRange: 140,
    tragedyWarning:
      '🔴 悲劇預警（低於 85cm）：洗碗機或烤箱門全開時人完全無法站立！兩人無法錯身，端熱湯轉身極易碰撞燙傷。',
    cautionNote:
      '🟡 勉強可用（85~94cm）：單人下廚尚可，但抽屜全拉開時後方無法通行，建議中島深度縮減 5~10cm。',
    comfortNote:
      '🟢 氣韻舒適標準（95cm 以上）：抽屜與洗碗機全開仍可從容走動，雙人備料下廚動線流暢。',
  },
  {
    id: 'wardrobe_bed',
    space: '主臥室',
    title: '衣櫃門片前方至床沿走道淨寬',
    unit: 'cm',
    minLimit: 50,
    comfortMin: 75,
    standard: 85,
    maxRange: 120,
    tragedyWarning:
      '🔴 悲劇預警（低於 60cm）：平開衣櫃門打開直接撞到床架！人必須側身螃蟹走或爬上床才能拿衣服，必須改用橫拉門。',
    cautionNote:
      '🟡 勉強可用（60~74cm）：單扇門片可開，但無法蹲下開最底層抽屜，換床單時手部空間局促。',
    comfortNote:
      '🟢 氣韻舒適標準（75cm 以上）：平開門與大型抽屜皆可完全展開，更衣與整理床鋪動線舒展。',
  },
  {
    id: 'shower_zone',
    space: '衛浴空間',
    title: '乾濕分離淋浴間內部短邊淨寬',
    unit: 'cm',
    minLimit: 70,
    comfortMin: 90,
    standard: 95,
    maxRange: 130,
    tragedyWarning:
      '🔴 悲劇預警（低於 80cm）：洗頭抬手時手肘會一直撞到強化玻璃與牆壁！彎腰撿肥皂或幫小孩洗澡完全轉不了身。',
    cautionNote:
      '🟡 勉強可用（80~89cm）：成人單獨淋浴堪用，但建議淋浴門務必做外推或橫拉，避免內推卡死空間。',
    comfortNote:
      '🟢 氣韻舒適標準（90cm 以上）：舉手轉身寬裕，未來若需放置沐浴椅或協助長輩幼童皆有餘裕。',
  },
  {
    id: 'tv_distance',
    space: '客廳',
    title: '75 吋電視牆面至沙發背牆淨深',
    unit: 'cm',
    minLimit: 220,
    comfortMin: 280,
    standard: 320,
    maxRange: 450,
    tragedyWarning:
      '🔴 悲劇預警（低於 250cm）：扣除沙發深度與茶几後走道剩不到 45cm，壓迫感極強且近距離仰視大螢幕易頭暈眼酸！',
    cautionNote:
      '🟡 勉強可用（250~279cm）：建議取消傳統大茶几改用邊几，並採用超薄壁掛架爭取視覺景深。',
    comfortNote:
      '🟢 氣韻舒適標準（280cm 以上）：視覺包覆感最佳，可配置完整茶几且保留 80cm 以上迴游動線。',
  },
];

/**
 * 3. 老工務長 Agent：隱蔽工程封板／試水前防呆驗收清單
 */
export const INSPECTION_ITEMS: InspectionItem[] = [
  {
    id: 'p1',
    stage: 'plumbing',
    title: '全室強弱電管線走向全景拍照存檔（標註尺寸基準）',
    photoHint: '每面牆須拍到管槽與地面／門框相對位置，防未來鑽孔打穿',
    critical: true,
  },
  {
    id: 'p2',
    stage: 'plumbing',
    title: '廚房高功率專迴（IH爐/洗碗機/烤箱）線徑 5.5mm² 核對',
    photoHint: '拍攝電線印字規格與配電箱無熔絲開關 (NFB) 安培數',
    critical: true,
  },
  {
    id: 'p3',
    stage: 'plumbing',
    title: '冷熱給水管加壓測試（持壓 60 分鐘無掉壓滲漏）',
    photoHint: '拍攝壓力錶讀數特寫與接頭乾爽狀態',
    critical: true,
  },
  {
    id: 'w1',
    stage: 'waterproof',
    title: '衛浴防水層塗刷高度（淋浴區至少 180cm～到頂）與隅角不織布補強',
    photoHint: '拍攝牆角轉折處與管口周圍防水收頭特寫',
    critical: true,
  },
  {
    id: 'w2',
    stage: 'waterproof',
    title: '滿水試水 48 小時水位標記＆樓下天花板確認無滲水',
    photoHint: '貼膠帶標記起始水位線，48 小時後拍對照圖',
    critical: true,
  },
  {
    id: 'w3',
    stage: 'waterproof',
    title: '排水孔保護蓋封貼（防泥作砂漿掉入阻塞存水彎）',
    photoHint: '確認落水頭封口完整未破損',
    critical: false,
  },
  {
    id: 'c1',
    stage: 'carpentry',
    title: '吊隱式冷氣排水管注水實測＆保溫棉完整包覆無外露',
    photoHint: '封天花板前最容易漏！倒水確認順暢流至排水管且無逆坡',
    critical: true,
  },
  {
    id: 'c2',
    stage: 'carpentry',
    title: '嵌燈／磁吸軌道燈／維修孔出線預留位置核對',
    photoHint: '避免封矽酸鈣板後電線被藏在角材上方找不到',
    critical: true,
  },
  {
    id: 'c3',
    stage: 'carpentry',
    title: '窗簾盒深度（雙軌≥18cm／蛇形簾≥22cm）與壁掛電視背板夾板加固',
    photoHint: '拉捲尺入鏡拍下實際深度與加固底板位置',
    critical: false,
  },
];

/**
 * 4. 碩士論文知識庫範例結構：〈住宅浴室地坪泥作之現場決策知識與 BIM 承載可行性〉
 * ⚠️ 注意：以下僅為「資料欄位結構範例（Placeholder）」，真正論文訪談與決策資料由 Jason 後續自行填入，不編造論文內容。
 */
export const BATHROOM_FLOOR_DECISION_EVENTS: BathroomFloorDecisionEvent[] = [
  {
    id: 'thesis-event-01',
    phase: '範例階段 A：地坪打底與高程控制',
    scenario: '【範例結構・待填入論文情境】例如：既有結構樓板高程落差與排水管預留高度之現場衝突情境',
    criteria: '【範例結構・待填入判斷依據】例如：依據現場雷射水平儀實測高程、完成面厚度限制與門檻收口條件',
    action: '【範例結構・待填入處理方式】例如：由 Jason 填入論文整理之現場泥作師傅／工務決策處置流程',
    bimParameter: '【BIM 承載欄位範例】IfcSlab / 自訂屬性集 (Pset_BathroomFloor_Decision)：高程基準、容許誤差、決策備註',
    isPlaceholder: true,
  },
  {
    id: 'thesis-event-02',
    phase: '範例階段 B：洩水坡度與落水頭定位',
    scenario: '【範例結構・待填入論文情境】例如：大尺寸地磚／長條形落水頭與乾濕區洩水坡度放樣決策',
    criteria: '【範例結構・待填入判斷依據】例如：依據磚材尺寸、排水距離、坡度比與切割美觀度之權衡條件',
    action: '【範例結構・待填入處理方式】例如：由 Jason 填入論文歸納之現場坡度調整與割磚對縫處理方式',
    bimParameter: '【BIM 承載欄位範例】坡度向量屬性、落水頭偏移容許值、非幾何經驗規則註記',
    isPlaceholder: true,
  },
  {
    id: 'thesis-event-03',
    phase: '範例階段 C：乾濕分離止水墩與防水銜接',
    scenario: '【範例結構・待填入論文情境】例如：淋浴區降板／無門檻止水收邊與泥作砂漿層界面決策',
    criteria: '【範例結構・待填入判斷依據】例如：依據防水層收頭高度、試水條件與無障礙順平需求',
    action: '【範例結構・待填入處理方式】例如：由 Jason 填入論文中針對工序先後與界面收頭之實務決策',
    bimParameter: '【BIM 承載欄位範例】工序相依性標籤 (Predecessor/Successor)、界面檢核狀態碼',
    isPlaceholder: true,
  },
];

/**
 * 5. 看圖指派 Agent：空間分區與常用缺失標籤
 */
export const FLOOR_ZONES: FloorZone[] = [
  { id: 'entry', name: '玄關落塵區', code: 'A1', gridRow: 0, gridCol: 0 },
  { id: 'living', name: '客廳主牆區', code: 'A2', gridRow: 0, gridCol: 1 },
  { id: 'dining', name: '中島餐廚區', code: 'A3', gridRow: 0, gridCol: 2 },
  { id: 'master', name: '主臥更衣區', code: 'B1', gridRow: 1, gridCol: 0 },
  { id: 'bath', name: '主衛浴濕區', code: 'B2', gridRow: 1, gridCol: 1 },
  { id: 'study', name: '書房臥榻區', code: 'B3', gridRow: 1, gridCol: 2 },
];

export const TRADE_CATEGORIES: TradeCategory[] = [
  '木作',
  '水電',
  '泥作',
  '油漆',
  '系統櫃',
  '空調',
];

export const QUICK_ISSUE_TAGS: Record<TradeCategory, string[]> = {
  木作: ['尺寸與圖面不符', '收邊縫隙待修', '角材水平微調', '維修孔尺寸確認'],
  水電: ['插座高度移位', '開關迴路對調', '網路/弱電未通', '出線孔位置偏移'],
  泥作: ['洩水坡度不足', '磁磚空心(澎共)', '填縫劑色差清理', '止水墩水平修正'],
  油漆: ['強光下批土波浪', '陰陽角垂流待磨', '乳膠漆跳色交界毛邊', '木皮收口沾漆清潔'],
  系統櫃: ['門片鉸鏈高低差', '抽屜滑軌卡頓', '矽利康收邊補打', '踢腳板密合度調整'],
  空調: ['出風口對齊木作開口', '排水管洩水坡度確認', '檢修口空間不足', '冷媒管保溫補強'],
};

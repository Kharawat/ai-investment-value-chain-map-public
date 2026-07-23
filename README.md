# AI Investment Value Chain Map

Interactive Dashboard ภาษาไทยสำหรับอธิบายความเชื่อมโยงของหุ้น 12 ตัว ตั้งแต่เครื่องจักรผลิตชิป ไปจนถึง Cloud, Enterprise AI, Consumer Devices, Healthcare และ Space Infrastructure

## ติดตั้งเป็น Web App บน iPhone

เมื่อนำไฟล์ชุดนี้ขึ้น HTTPS hosting แล้ว ให้เปิด URL ด้วย Safari จากนั้นแตะ **Share → Add to Home Screen → Add** ระบบจะเปิดแบบเต็มหน้าจอ มี App Icon และเก็บหน้า Dashboard ไว้เปิดซ้ำได้

iOS จะพัก Web App เมื่อปิดหรืออยู่เบื้องหลัง ราคาจึงอัปเดตทุก 30 วินาทีเฉพาะขณะเปิดแอปอยู่

## เปิดใช้งาน

1. ดาวน์โหลดหรือ Clone repository
2. เปิดไฟล์ `index.html`
3. ใช้งานได้ทันทีโดยไม่ต้องมี Backend, Database หรือขั้นตอนติดตั้ง

รองรับ Chrome, Edge, Firefox และ Safari เวอร์ชันปัจจุบัน

## ฟีเจอร์

- AI Value Chain จำนวน 8 ชั้น
- Company Cards พร้อมรายละเอียดรายได้ ลูกค้า Dependencies และ Risks
- Search และ Filter ตามกลุ่มธุรกิจ
- Relationship Map พร้อม Tooltip
- Scenario Analysis จำนวน 7 รูปแบบ
- Portfolio Dependency Matrix ที่เรียงลำดับได้
- Earnings Checklist ที่บันทึกสถานะใน Browser
- UI ราคาหุ้นที่เชื่อมต่อได้กับ endpoint `/api/quotes`
- Dark/Light mode
- Keyboard navigation
- Responsive layout สำหรับ Desktop และ Mobile
- รวม SpaceX (`SPCX`) ในชั้น Space Infrastructure

## โครงสร้างไฟล์

```text
├── index.html
├── styles.css
├── app.js
├── data.js
├── manifest.webmanifest
├── sw.js
├── icons/
└── README.md
```

- `index.html` — Semantic HTML และพื้นที่ Render หลัก
- `styles.css` — Theme, Components และ Responsive Design
- `app.js` — Search, Filter, Drawer, Matrix และ Checklist
- `data.js` — ข้อมูลบริษัท ความสัมพันธ์ Scenario และ Matrix

## การแก้ไขข้อมูล

ข้อมูลทั้งหมดเก็บใน `data.js` เพื่อไม่ให้ Hardcode ซ้ำใน HTML

### เพิ่มบริษัท

เพิ่ม Object ใน Array `companies`:

```javascript
{
  ticker: "EXAMPLE",
  name: "Example Company",
  layer: 4,
  category: "Cloud",
  position: "Cloud and AI Infrastructure",
  revenue: [],
  customers: [],
  dependencies: [],
  growthDrivers: [],
  risks: [],
  metrics: [],
  goodImpact: [],
  badImpact: []
}
```

### เพิ่มความสัมพันธ์

เพิ่ม Object ใน Array `relationships`:

```javascript
{
  from: "TSMC",
  to: "NVDA",
  label: "ผลิต GPU + packaging",
  detail: "TSMC ผลิต GPU และ advanced packaging ให้ NVIDIA",
  level: "Direct"
}
```

### เพิ่ม Scenario

เพิ่ม Object ใน Array `scenarios`:

```javascript
{
  id: "example",
  title: "Scenario H · ตัวอย่าง",
  signals: [],
  impacts: [],
  cautions: []
}
```

## SPCX

ก่อนใช้ข้อมูล SPCX ให้ยืนยันชื่อเต็ม ตลาดหลักทรัพย์ และประเทศ แล้วแก้ `SPCX_CONFIG` ด้านบนของ `data.js`

จนกว่าจะยืนยัน ระบบจะแสดง `Needs verification` และค่า `Unknown`

## Real-time Data

Frontend จะเรียก endpoint `/api/quotes` ทุก 30 วินาทีและแสดงราคา การเปลี่ยนแปลงรายวัน สถานะตลาด และเวลาอัปเดต

Public repository นี้ตั้งใจไม่รวม Backend, API key หรือข้อมูล deployment ภายใน หากเปิด `index.html` โดยตรง ส่วนวิเคราะห์จะทำงานครบ แต่ราคาจะแสดงสถานะ Offline

หากต้องการเปิดระบบราคาใน deployment ของตนเอง ให้สร้าง Serverless Function หรือ API Proxy ที่คืนข้อมูลรูปแบบนี้:

```json
{
  "status": "ok",
  "source": "Market data provider",
  "marketStatus": "OPEN",
  "updatedAt": "2026-07-23T15:30:00.000Z",
  "quotes": [
    {
      "ticker": "AAPL",
      "symbol": "AAPL",
      "price": 200,
      "change": 1.5,
      "changePercent": 0.75
    }
  ]
}
```

เก็บ API key ฝั่ง Server เท่านั้น ห้ามใส่ Secret ลงใน `app.js` หรือ `data.js`

## Disclaimer

ข้อมูลนี้จัดทำเพื่ออธิบายโครงสร้างธุรกิจและความสัมพันธ์ของบริษัทเท่านั้น ไม่ใช่คำแนะนำในการซื้อหรือขายหลักทรัพย์

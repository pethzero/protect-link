# Protect Link

Extension สำหรับ Chrome / Edge ที่บล็อก **การเด้งไปเว็บอื่นอัตโนมัติ** ซึ่งผู้ใช้ไม่ได้กดเอง แล้วแสดงหน้าเตือนให้เลือกว่าจะไปต่อหรือไม่

## ติดตั้ง (โหมดนักพัฒนา)
1. เปิด `chrome://extensions` (หรือ `edge://extensions`)
2. เปิด **Developer mode**
3. กด **Load unpacked** แล้วเลือกโฟลเดอร์นี้

## กฎที่ใช้ตัดสิน
บล็อกเมื่อเข้า **ทุกข้อ** ต่อไปนี้:
- ผู้ใช้ไม่ได้คลิก/กดแป้น (`navigate.userInitiated` เป็น false และไม่มี user activation ในไม่กี่วินาทีที่ผ่านมา)
- ปลายทางเป็นคนละโดเมน (เทียบระดับ eTLD+1 เช่น `a.example.co.th` กับ `b.example.co.th` ถือว่าโดเมนเดียวกัน) หรือเป็น scheme แปลก ๆ เช่น `intent:`
- เว็บต้นทางไม่อยู่ในรายการ "เชื่อถือ" และปลายทางไม่อยู่ในรายการปลายทางที่เชื่อถือ (login / จ่ายเงิน)

| วิธีที่เว็บใช้เด้ง | จัดการโดย |
|---|---|
| `location.href`, `location.replace()` | Navigation API → ยกเลิกได้ทันที |
| `<meta http-equiv="refresh">` | Navigation API |
| ฟอร์มส่งตัวเองอัตโนมัติ | Navigation API (กด "ไปต่อ" จะส่งฟอร์มเดิมซ้ำ) |
| `window.open()` ป๊อปอัป | ครอบฟังก์ชัน `window.open` |
| HTTP 301/302 จากเซิร์ฟเวอร์ | บันทึกใน popup + บล็อกถาวรด้วย `declarativeNetRequest` |

## โครงสร้าง
- `src/inject.js` – รันใน MAIN world ดักการเด้ง (คุยกับ content.js ผ่าน CustomEvent + nonce กันเว็บปลอมข้อความ)
- `src/content.js` – หน้าต่างเตือน (closed shadow DOM) และตัวกลางไป background
- `src/background.js` – badge, ประวัติ, รายการเชื่อถือ, กฎบล็อกถาวร
- `src/popup.*` – หน้าตั้งค่า
- `src/shared.js` – ฟังก์ชันเทียบโดเมนและสัญญาณเสี่ยงของ URL

## ทดสอบ
```sh
npm i -D puppeteer
node test/run.mjs
```
เปิดเซิร์ฟเวอร์ทดสอบที่พอร์ต 8080/8081 แล้วตรวจทุกกรณีด้วย Chrome for Testing

## ข้อจำกัดที่รู้อยู่
- **Redirect จากเซิร์ฟเวอร์** (HTTP 30x) MV3 หยุดแบบ real-time ไม่ได้ ทำได้แค่บันทึก และบล็อกถาวรเป็นรายโดเมน
- **กดตรงไหนก็เด้ง** (ชั้นโปร่งใสครอบทั้งหน้า): เบราว์เซอร์นับว่าผู้ใช้กดเอง จึงไม่ถูกบล็อก
- **iframe ข้ามโดเมนสั่ง `top.location`**: Chrome บล็อกเองอยู่แล้วถ้าไม่มี user gesture
- เว็บที่ตั้งใจหลบอาจสร้าง iframe ใหม่เพื่อเอา `window.open` ตัวจริงมาใช้ได้
- รายการ eTLD+1 เป็นแบบย่อ ไม่ใช่ Public Suffix List เต็ม

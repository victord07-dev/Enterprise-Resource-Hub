---
title: Employee ID card with QR code (My Portal + HR view)
---
# Employee ID Card with QR Code

  ## What & Why
  Generate a professional, downloadable digital ID card for every employee — containing their name, designation, department, company, employee code, and QR code (used for Kiosk attendance check-in). The card is available in three places:
  1. **My Portal** — Every employee sees their own ID card and can download it as a PDF.
  2. **Employees module (HR view)** — HR/admin can view any employee's ID card from the employee list.

  The QR code is already generated per-employee and stored as a code string (format: `NEXERP-EMP-[uuid]`) in the `employees.qrCode` field. The ID card simply needs to display it visually.

  ## Done looks like
  - Every employee with a generated QR code can see a styled ID card on their My Portal page
  - A "Download ID Card" button on My Portal exports the card as a PDF using jsPDF
  - HR/admin can click an "ID Card" button per employee in the Employees module to open a dialog showing that employee's card with a download option
  - The card design includes: ITFI Group branding, employee name/designation/department, employee code, QR code image, and join date
  - Employees without a QR code see a prompt to ask HR to generate one

  ## Out of scope
  - Physical card printing integration
  - Photo/selfie on the card (no photo field exists on employees)
  - Bulk download of all ID cards at once

  ## Tasks
  1. **Install qrcode library for client-side QR rendering** — Install the `qrcode` npm package (web-compatible) to generate QR code data URLs client-side from the stored code string, so the ID card can render the QR image anywhere without a server call.

  2. **Build EmployeeIdCard component** — Create `client/src/components/EmployeeIdCard.tsx`, a self-contained React component that renders the styled ID card using only employee data. Design: navy blue header with "ITFI Group" branding, employee name/designation/department, employee code, QR code image, join date, and "Scan for Attendance" label. The component takes an `employee` prop and generates the QR code image internally.

  3. **Build ID card PDF download utility** — Create `client/src/lib/id-card-pdf.ts` using jsPDF to render the ID card as a downloadable PDF. Reuse the same layout as the visual component: colored header block, text fields, embedded QR code image (from the generated data URL).

  4. **Add ID card to My Portal** — In `client/src/pages/MyPortal.tsx`, add a new "My ID Card" section that shows the EmployeeIdCard component and a "Download ID Card" button. Only show when the employee has a qrCode value; otherwise show a message to contact HR.

  5. **Add ID card viewer to Employees module** — In `client/src/pages/Employees.tsx`, add an "ID Card" icon button per employee row. Clicking it opens a Dialog containing the EmployeeIdCard component and a download button. Only show the button if the employee has a qrCode.

  ## Relevant files
  - `client/src/pages/MyPortal.tsx`
  - `client/src/pages/Employees.tsx`
  - `client/src/lib/quotation-pdf.ts`
  - `shared/schema.ts:175`
  - `server/routes.ts:3595`
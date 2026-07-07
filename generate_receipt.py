import os
import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether, HRFlowable
)

def generate_qr_image(data, filename="qrcode_temp.png"):
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=2,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#111216", back_color="white")
    img.save(filename)
    return filename

def build_pdf(pdf_path="receipt_order_10245.pdf"):
    # Create QR code for purchase verification
    qr_data = "https://verify.bekollo.et/order/INV-20260706-10245?hash=8f9a2b4c6e1d&seller=891204&tx=TBX-891204-99218401"
    qr_img_path = generate_qr_image(qr_data)

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        rightMargin=40, leftMargin=40,
        topMargin=40, bottomMargin=40
    )

    styles = getSampleStyleSheet()
    
    # Custom Styles
    primary_color = colors.HexColor("#111216")
    accent_color = colors.HexColor("#D97706") # Deep amber/gold
    light_bg = colors.HexColor("#F8FAFC")
    border_color = colors.HexColor("#E2E8F0")

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=primary_color
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor("#64748B")
    )

    h2_style = ParagraphStyle(
        'H2Style',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        textColor=primary_color,
        spaceAfter=6
    )

    body_style = ParagraphStyle(
        'BodyStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#334155")
    )

    body_bold = ParagraphStyle(
        'BodyBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=14,
        textColor=primary_color
    )

    table_cell = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#1E293B")
    )

    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#0F172A")
    )

    story = []

    # Top Header Table (Logo / Brand on left, Invoice Info on right)
    header_left = [
        Paragraph("<b>BEKOLLO | ዋጋው!</b>", title_style),
        Paragraph("GroupCommerce TMA • Verified Ethiopian Store Hub", subtitle_style),
        Paragraph("Autonomous Telegram E-Commerce Platform", subtitle_style)
    ]

    header_right = [
        Paragraph("<b>OFFICIAL PURCHASE RECEIPT</b>", ParagraphStyle('HRTitle', fontName='Helvetica-Bold', fontSize=14, leading=16, textColor=accent_color, alignment=2)),
        Paragraph("<b>Receipt #:</b> INV-20260706-10245", ParagraphStyle('HR1', parent=body_style, alignment=2)),
        Paragraph("<b>Date:</b> July 6, 2026 • 17:15:22 EAT", ParagraphStyle('HR2', parent=body_style, alignment=2)),
        Paragraph("<b>Status:</b> <font color='#10B981'><b>PAID & SETTLED DIRECTLY</b></font>", ParagraphStyle('HR3', parent=body_style, alignment=2))
    ]

    header_table = Table([[header_left, header_right]], colWidths=[3.2*inch, 4.1*inch])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(header_table)
    story.append(HRFlowable(width="100%", thickness=2, color=primary_color, spaceBefore=4, spaceAfter=14))

    # Two-Column Info: Seller Info vs Buyer Info
    seller_info = [
        Paragraph("MERCHANT SELLER DETAILS", h2_style),
        Paragraph("<b>Store Name:</b> Bole Apple & Tech Hub (#892)", body_style),
        Paragraph("<b>Telegram Channel:</b> @BoleAppleDeals", body_style),
        Paragraph("<b>Physical Store:</b> Bole Sub-City, Woreda 03, Near Edna Mall, Addis Ababa", body_style),
        Paragraph("<b>Telebirr Shortcode:</b> 891204 (Verified Direct)", body_style),
        Paragraph("<b>Store Policy:</b> 3-Day Replacement Warranty", body_style)
    ]

    buyer_info = [
        Paragraph("BUYER & DELIVERY DESTINATION", h2_style),
        Paragraph("<b>Customer Name:</b> Mike Fikadu", body_style),
        Paragraph("<b>Telegram ID:</b> @Mike_Fikadu (ID: 12893412)", body_style),
        Paragraph("<b>Delivery Address:</b> Bole Sub-City, Woreda 03, House 412, Addis Ababa", body_style),
        Paragraph("<b>Phone Contact:</b> +251 911 234 567", body_style),
        Paragraph("<b>Dispatch Status:</b> Store Courier Assigned (Rider Abebe)", body_style)
    ]

    info_table = Table([[seller_info, buyer_info]], colWidths=[3.65*inch, 3.65*inch])
    info_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BACKGROUND', (0,0), (0,0), light_bg),
        ('BACKGROUND', (1,0), (1,0), colors.HexColor("#FEF3C7")),
        ('PADDING', (0,0), (-1,-1), 10),
        ('BOX', (0,0), (0,0), 1, border_color),
        ('BOX', (1,0), (1,0), 1, colors.HexColor("#FDE68A")),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 16))

    # Order Items Table
    story.append(Paragraph("ITEMIZED ORDER BREAKDOWN", h2_style))
    
    table_data = [
        [
            Paragraph("<b>Item Description</b>", table_cell_bold),
            Paragraph("<b>Policy / Warranty</b>", table_cell_bold),
            Paragraph("<b>Qty</b>", table_cell_bold),
            Paragraph("<b>Unit Price (ETB)</b>", table_cell_bold),
            Paragraph("<b>Total (ETB)</b>", table_cell_bold)
        ],
        [
            Paragraph("Apple iPhone 15 Pro Max (256GB - Titanium)<br/><font color='#64748B' size=8>SKU: AAPL-IP15PM-256-TI • Verified Store Item</font>", table_cell),
            Paragraph("3-Day Replacement Warranty", table_cell),
            Paragraph("1", table_cell),
            Paragraph("Br 165,000.00", table_cell),
            Paragraph("Br 165,000.00", table_cell_bold)
        ],
        [
            Paragraph("Addis Ababa Store Courier Delivery<br/><font color='#64748B' size=8>Zone: Bole Sub-City Express Dispatch</font>", table_cell),
            Paragraph("Same-Day Delivery", table_cell),
            Paragraph("1", table_cell),
            Paragraph("Br 200.00", table_cell),
            Paragraph("Br 200.00", table_cell_bold)
        ]
    ]

    items_table = Table(table_data, colWidths=[2.8*inch, 1.6*inch, 0.5*inch, 1.2*inch, 1.2*inch])
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('PADDING', (0,0), (-1,-1), 8),
    ]))
    
    # Update text color of header row cells specifically
    for col_idx in range(5):
        table_data[0][col_idx].style.textColor = colors.white

    story.append(items_table)
    
    # Totals Section Table
    totals_data = [
        ["", "", "", Paragraph("<b>Subtotal:</b>", table_cell), Paragraph("Br 165,200.00", table_cell)],
        ["", "", "", Paragraph("<b>Marketplace Escrow Fee:</b>", table_cell), Paragraph("Br 0.00 (Direct)", table_cell)],
        ["", "", "", Paragraph("<b>TOTAL PAID:</b>", table_cell_bold), Paragraph("<b>Br 165,200.00</b>", ParagraphStyle('TotPaid', parent=table_cell_bold, fontSize=11, textColor=accent_color))]
    ]
    totals_table = Table(totals_data, colWidths=[2.8*inch, 1.6*inch, 0.5*inch, 1.2*inch, 1.2*inch])
    totals_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('PADDING', (0,0), (-1,-1), 6),
        ('LINEABOVE', (3,2), (4,2), 1.5, primary_color),
        ('BACKGROUND', (3,2), (4,2), light_bg),
    ]))
    story.append(totals_table)
    story.append(Spacer(1, 20))

    # QR Code & Cryptographic Verification Box
    qr_img = Image(qr_img_path, width=1.4*inch, height=1.4*inch)
    
    qr_text = [
        Paragraph("<b>CRYPTOGRAPHIC PURCHASE VERIFICATION</b>", h2_style),
        Paragraph("Scan this QR code with your phone camera or Telegram scanner to independently verify this purchase on the blockchain/HMAC registry.", body_style),
        Spacer(1, 4),
        Paragraph("<b>Transaction Ref (TXID):</b> TBX-891204-99218401", body_style),
        Paragraph("<b>Settlement Gateway:</b> Telebirr SuperApp Direct Pre-Order", body_style),
        Paragraph("<b>Verification Hash:</b> <font name='Courier' size=8>8f9a2b4c6e1d99a182736451000918273645</font>", body_style),
        Paragraph("<b>Verification URL:</b> <font color='#2563EB'>verify.bekollo.et/order/INV-20260706-10245</font>", body_style),
    ]

    qr_table = Table([[qr_img, qr_text]], colWidths=[1.6*inch, 5.7*inch])
    qr_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ALIGN', (0,0), (0,0), 'CENTER'),
        ('BACKGROUND', (0,0), (-1,-1), light_bg),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('PADDING', (0,0), (-1,-1), 12),
    ]))
    story.append(KeepTogether(qr_table))

    # Footer Notice
    story.append(Spacer(1, 16))
    footer_p = Paragraph(
        "<font size=8 color='#64748B'><b>Notice:</b> This receipt is generated autonomously by GroupCommerce TMA (@ShopGramEtBot) inside Telegram. "
        "Per our 1,000-seller zero-escrow architecture, payment was settled directly to Bole Apple & Tech Hub (Telebirr Code: 891204). "
        "For warranty claims or returns, present this receipt QR code to the store courier or at the seller's physical shop in Bole.</font>",
        ParagraphStyle('Footer', parent=body_style, alignment=1)
    )
    story.append(footer_p)

    doc.build(story)
    if os.path.exists(qr_img_path):
        os.remove(qr_img_path)
    print(f"PDF successfully built: {pdf_path}")

if __name__ == "__main__":
    build_pdf()

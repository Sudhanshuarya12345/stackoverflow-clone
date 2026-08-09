import PDFDocument from "pdfkit";

// Returns a promise that resolves with a Buffer containing the PDF data
export const generateInvoicePdfBuffer = (paymentDoc, userDoc, planDetails) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      // Header
      doc.fontSize(20).text("Invoice", { align: "right" });
      doc.fontSize(10).text(`Invoice Number: ${paymentDoc.invoice_number}`, { align: "right" });
      doc.text(`Date: ${new Date(paymentDoc.createdAt).toLocaleDateString()}`, { align: "right" });
      doc.text(`Transaction ID: ${paymentDoc.transaction_id || paymentDoc.razorpay_payment_id}`, { align: "right" });
      doc.moveDown();

      // Bill To
      doc.fontSize(14).text("Bill To:");
      const billing = userDoc.billingDetails || {};
      doc.fontSize(12).text(billing.billingName || userDoc.name);
      doc.text(billing.billingEmail || userDoc.email);
      if (billing.addressLine1) {
        doc.text(billing.addressLine1);
        if (billing.addressLine2) doc.text(billing.addressLine2);
        const cityLine = [billing.city, billing.state, billing.postalCode].filter(Boolean).join(", ");
        if (cityLine) doc.text(cityLine);
        if (billing.country) doc.text(billing.country);
      }
      if (billing.gstNumber) doc.text(`GSTIN: ${billing.gstNumber}`);
      doc.moveDown(2);

      // Plan Details Table
      const tableTop = doc.y;
      doc.fontSize(12).text("Description", 50, tableTop);
      doc.text("Amount", 400, tableTop, { align: "right" });
      
      const hrY = doc.y + 5;
      doc.moveTo(50, hrY).lineTo(500, hrY).stroke();
      
      const rowTop = hrY + 10;
      doc.text(`Subscription - ${planDetails.name} Plan`, 50, rowTop);
      doc.text(`${paymentDoc.currency || "INR"} ${(paymentDoc.amount / 100).toFixed(2)}`, 400, rowTop, { align: "right" });

      doc.moveDown(4);
      doc.fontSize(11).text(`Billing Period: ${paymentDoc.billing_period_start ? new Date(paymentDoc.billing_period_start).toLocaleDateString() : "N/A"} - ${paymentDoc.billing_period_end ? new Date(paymentDoc.billing_period_end).toLocaleDateString() : "N/A"}`);
      doc.text(`Payment Method: ${paymentDoc.payment_method || "Razorpay"}`);
      doc.text(`GST/Tax: ${paymentDoc.currency || "INR"} ${((paymentDoc.tax_amount || 0) / 100).toFixed(2)}`);
      doc.text(`Total Paid: ${paymentDoc.currency || "INR"} ${(paymentDoc.amount / 100).toFixed(2)}`);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

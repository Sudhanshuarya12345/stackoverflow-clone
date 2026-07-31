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
      doc.moveDown();

      // Bill To
      doc.fontSize(14).text("Bill To:");
      doc.fontSize(12).text(userDoc.name);
      doc.text(userDoc.email);
      doc.moveDown(2);

      // Plan Details Table
      const tableTop = doc.y;
      doc.fontSize(12).text("Description", 50, tableTop);
      doc.text("Amount", 400, tableTop, { align: "right" });
      
      const hrY = doc.y + 5;
      doc.moveTo(50, hrY).lineTo(500, hrY).stroke();
      
      const rowTop = hrY + 10;
      doc.text(`Subscription - ${planDetails.name} Plan`, 50, rowTop);
      doc.text(`INR ${(paymentDoc.amount / 100).toFixed(2)}`, 400, rowTop, { align: "right" });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

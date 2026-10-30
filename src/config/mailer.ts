import nodemailer from 'nodemailer';

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

export async function sendOTPEmail(to: string, otp: string) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('\n========================================');
    console.log(`⚠️ SMTP NOT CONFIGURED. TEST OTP for ${to}: ${otp}`);
    console.log('========================================\n');
    return; 
  }
  try {
    await transporter.sendMail({
      from: `"BNAI Assistant" <${process.env.SMTP_USER}>`,
      to,
      subject: 'Your BNAI Assistant Verification Code',
      text: `Your OTP is: ${otp}. It expires in 10 minutes.`,
    });
    console.log(`OTP email sent to ${to}`);
  } catch (error) {
    console.error('Failed to send OTP email', error);
  }
}

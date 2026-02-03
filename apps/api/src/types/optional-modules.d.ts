declare module '@sendgrid/mail' {
  const sgMail: unknown;
  export default sgMail;
}

declare module 'twilio' {
  const twilioFactory: unknown;
  export default twilioFactory;
}

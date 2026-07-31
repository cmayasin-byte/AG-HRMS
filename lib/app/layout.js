import './globals.css';

export const metadata = {
  title: 'HR & Payroll',
  description: 'Internal HR and payroll management',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

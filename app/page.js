"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const currency = (n) => "Rs " + Math.round(n || 0).toLocaleString("en-PK");
const currentPeriod = () => {
  const d = new Date();
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
};

export default function Home() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      supabase.from("profiles").select("*").eq("id", session.user.id).single()
        .then(({ data }) => setProfile(data));
    } else {
      setProfile(null);
    }
  }, [session]);

  if (session === undefined) return <div className="login-wrap">Loading…</div>;
  if (!session) return <Login />;
  if (!profile) return <div className="login-wrap">Setting up your account…</div>;

  return profile.role === "admin" ? <AdminApp profile={profile} /> : <EmployeeApp profile={profile} />;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleLogin}>
        <h1 style={{ margin: 0, fontSize: 18 }}>HR & Payroll</h1>
        <p style={{ color: "#8a8577", fontSize: 13, marginTop: 4 }}>Sign in to your account</p>
        <label>Email</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>Password</label>
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <p className="err">{err}</p>}
        <button className="btn btn-primary" style={{ width: "100%", marginTop: 16 }}>Sign in</button>
      </form>
    </div>
  );
}

function Shell({ role, active, setActive, children }) {
  const adminItems = [["dashboard", "Dashboard"], ["employees", "Employees"], ["attendance", "Attendance"], ["payroll", "Payroll"], ["settings", "Settings"]];
  const empItems = [["payslips", "My Payslips"]];
  const items = role === "admin" ? adminItems : empItems;
  return (
    <div className="shell">
      <div className="sidebar">
        <h1>HR & Payroll</h1>
        <p className="sub">{role === "admin" ? "Admin" : "Employee"} view</p>
        {items.map(([key, label]) => (
          <button key={key} className={`navbtn ${active === key ? "active" : ""}`} onClick={() => setActive(key)}>
            {label}
          </button>
        ))}
        <button className="navbtn" style={{ marginTop: 20, color: "#8a8577" }} onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
      <div className="main">{children}</div>
    </div>
  );
}

function EmployeeApp({ profile }) {
  const [active, setActive] = useState("payslips");
  const [payslips, setPayslips] = useState([]);

  useEffect(() => {
    supabase.from("payslips").select("*").order("period", { ascending: false })
      .then(({ data }) => setPayslips(data || []));
  }, []);

  return (
    <Shell role="employee" active={active} setActive={setActive}>
      <h2>My Payslips</h2>
      {payslips.length === 0 && <div className="card">No payslips yet. Check back after payroll is run.</div>}
      {payslips.map((p) => (
        <div className="card" key={p.id}>
          <div className="row"><strong>{p.period}</strong><span className="mono">{currency(p.net_pay)}</span></div>
          <table style={{ marginTop: 10 }}>
            <tbody>
              <tr><td>Base (prorated)</td><td className="mono">{currency(p.base_prorated)}</td></tr>
              <tr><td>Allowance</td><td className="mono">{currency(p.allowance)}</td></tr>
              <tr><td>Gross</td><td className="mono">{currency(p.gross)}</td></tr>
              <tr><td>Tax</td><td className="mono">-{currency(p.tax)}</td></tr>
              <tr><td>Other deductions</td><td className="mono">-{currency(p.other_deduction)}</td></tr>
              <tr><td><strong>Net pay</strong></td><td className="mono"><strong>{currency(p.net_pay)}</strong></td></tr>
            </tbody>
          </table>
        </div>
      ))}
    </Shell>
  );
}

function AdminApp() {
  const [active, setActive] = useState("dashboard");
  const [employees, setEmployees] = useState([]);
  const [settings, setSettings] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [period, setPeriod] = useState(currentPeriod());
  const [payrollResults, setPayrollResults] = useState(null);
  const [modalEmp, setModalEmp] = useState(null);

  async function loadAll() {
    const [e, s, a] = await Promise.all([
      supabase.from("employees").select("*").order("name"),
      supabase.from("settings").select("*").single(),
      supabase.from("attendance").select("*").eq("period", period),
    ]);
    setEmployees(e.data || []);
    setSettings(s.data);
    setAttendance(a.data || []);
  }
  useEffect(() => { loadAll(); }, [period]);

  const active_emps = employees.filter((e) => e.status === "Active");
  const attMap = Object.fromEntries(attendance.map((a) => [a.employee_id, a.days_present]));

  function calc(emp) {
    if (!settings) return {};
    const days = attMap[emp.id] ?? settings.working_days;
    const ratio = Math.min(days / settings.working_days, 1);
    const base_prorated = emp.base_salary * ratio;
    const allowance = base_prorated * (settings.allowance_pct / 100);
    const gross = base_prorated + allowance;
    const tax = gross * (settings.tax_pct / 100);
    const net_pay = gross - tax - (emp.other_deduction || 0);
    return { days, base_prorated, allowance, gross, tax, net_pay };
  }

  async function saveEmployee(form) {
    if (form.id) {
      await supabase.from("employees").update(form).eq("id", form.id);
    } else {
      const { id, ...rest } = form;
      await supabase.from("employees").insert(rest);
    }
    setModalEmp(null);
    loadAll();
  }

  async function deleteEmployee(id) {
    await supabase.from("employees").delete().eq("id", id);
    loadAll();
  }

  async function saveAttendance(empId, days) {
    await supabase.from("attendance").upsert({ employee_id: empId, period, days_present: days }, { onConflict: "employee_id,period" });
    loadAll();
  }

  async function runPayroll() {
    const rows = active_emps.map((emp) => {
      const c = calc(emp);
      return {
        employee_id: emp.id, period,
        base_prorated: c.base_prorated, allowance: c.allowance, gross: c.gross,
        tax: c.tax, other_deduction: emp.other_deduction || 0, net_pay: c.net_pay,
      };
    });
    await supabase.from("payslips").upsert(rows, { onConflict: "employee_id,period" });
    setPayrollResults(rows.map((r) => ({ ...r, emp: active_emps.find((e) => e.id === r.employee_id) })));
  }

  async function saveSettings(s) {
    await supabase.from("settings").update(s).eq("id", 1);
    loadAll();
  }

  return (
    <Shell role="admin" active={active} setActive={setActive}>
      {active === "dashboard" && settings && (
        <>
          <h2>Dashboard — {period}</h2>
          <div className="card">
            <p>Active employees: <strong>{active_emps.length}</strong></p>
            <p>Estimated payroll cost: <span className="mono">{currency(active_emps.reduce((s, e) => s + (calc(e).net_pay || 0), 0))}</span></p>
          </div>
        </>
      )}

      {active === "employees" && (
        <>
          <div className="row"><h2>Employees</h2>
            <button className="btn btn-primary" onClick={()

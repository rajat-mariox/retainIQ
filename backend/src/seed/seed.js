/**
 * Seed Script
 * Populates: 1 org, departments, 1 admin + 1 HR + 2 managers + 12 employees,
 * varied signals + pulse surveys, and computes initial risk for everyone.
 *
 * Run: npm run seed
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Department = require('../models/Department');
const Employee = require('../models/Employee');
const Signal = require('../models/Signal');
const PulseSurvey = require('../models/PulseSurvey');
const Plan = require('../models/Plan');
const RiskAssessment = require('../models/RiskAssessment');
const Notification = require('../models/Notification');
const ActivityLog = require('../models/ActivityLog');
const ProductivityScore = require('../models/ProductivityScore');
const Alert = require('../models/Alert');
const { ORGANIZATION_APPROVAL_STATUS, ROLES } = require('../config/constants');
const { calculateRisk } = require('../services/riskScoringService');
const { calculateProductivity } = require('../services/productivityScoringService');

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];

async function clear() {
  await Promise.all([
    User.deleteMany({}),
    Organization.deleteMany({}),
    Department.deleteMany({}),
    Employee.deleteMany({}),
    Signal.deleteMany({}),
    PulseSurvey.deleteMany({}),
    Plan.deleteMany({}),
    RiskAssessment.deleteMany({}),
    Notification.deleteMany({}),
    ActivityLog.deleteMany({}),
    ProductivityScore.deleteMany({}),
    Alert.deleteMany({}),
  ]);
}

async function run() {
  await connectDB();
  await clear();
  console.log('[seed] cleared collections');

  // Super Admin
  await User.create({
    name: 'RetainIQ Super Admin',
    email: 'super@retainiq.dev',
    passwordHash: await User.hashPassword('SuperPass!234'),
    role: ROLES.SUPER_ADMIN,
  });

  // Organization
  const org = await Organization.create({
    name: 'Acme Technologies',
    domain: 'acme.test',
    industry: 'Software',
    size: '50-200',
    plan: 'growth',
    isActive: true,
    approvalStatus: ORGANIZATION_APPROVAL_STATUS.APPROVED,
    settings: { productivity: { roiEnabled: true } },
  });
  await Plan.create({ organizationId: org._id, plan: 'growth', seats: 100 });

  // Departments
  const deptNames = ['Engineering', 'Product', 'Sales', 'Customer Success'];
  const departments = await Department.insertMany(
    deptNames.map((name) => ({ organizationId: org._id, name }))
  );

  // Admin & HR
  const admin = await User.create({
    organizationId: org._id,
    name: 'Anita Admin',
    email: 'admin@acme.test',
    passwordHash: await User.hashPassword('AdminPass!234'),
    role: ROLES.ORG_ADMIN,
  });
  const hr = await User.create({
    organizationId: org._id,
    name: 'Hari HR',
    email: 'hr@acme.test',
    passwordHash: await User.hashPassword('HrPass!234'),
    role: ROLES.HR_ADMIN,
  });

  // Managers (also as employees)
  const managerEmployees = [];
  const managerUsers = [];
  for (let i = 0; i < 2; i++) {
    const dept = departments[i];
    const empDoc = await Employee.create({
      organizationId: org._id,
      name: `Manager ${i + 1}`,
      email: `manager${i + 1}@acme.test`,
      designation: 'Engineering Manager',
      departmentId: dept._id,
      employmentType: 'full_time',
      workMode: 'hybrid',
      joiningDate: new Date(Date.now() - rand(400, 1500) * 24 * 3600 * 1000),
      lastAppraisalDate: new Date(Date.now() - rand(60, 360) * 24 * 3600 * 1000),
      lastSalaryRevisionDate: new Date(Date.now() - rand(120, 540) * 24 * 3600 * 1000),
    });
    const userDoc = await User.create({
      organizationId: org._id,
      employeeId: empDoc._id,
      name: empDoc.name,
      email: empDoc.email,
      passwordHash: await User.hashPassword('ManagerPass!234'),
      role: ROLES.MANAGER,
    });
    managerEmployees.push(empDoc);
    managerUsers.push(userDoc);
  }

  // Employees (12) under those managers
  const designations = ['Software Engineer', 'Senior Engineer', 'Product Designer', 'PM', 'Account Executive', 'CSM'];
  const employees = [];
  for (let i = 0; i < 12; i++) {
    const dept = pick(departments);
    const mgr = pick(managerEmployees);
    const emp = await Employee.create({
      organizationId: org._id,
      employeeCode: `ACM-${1000 + i}`,
      name: `Employee ${i + 1}`,
      email: `emp${i + 1}@acme.test`,
      phone: `+91-9${rand(100000000, 999999999)}`,
      departmentId: dept._id,
      designation: pick(designations),
      reportingManagerId: mgr._id,
      joiningDate: new Date(Date.now() - rand(60, 1800) * 24 * 3600 * 1000),
      lastAppraisalDate: new Date(Date.now() - rand(60, 720) * 24 * 3600 * 1000),
      lastSalaryRevisionDate: new Date(Date.now() - rand(120, 900) * 24 * 3600 * 1000),
      employmentType: 'full_time',
      workMode: pick(['office', 'hybrid', 'remote']),
      monthlyCost: rand(60000, 180000),         // INR-style numbers; org-defined
      roleValuePerHour: rand(800, 2200),
      currency: 'INR',
    });
    employees.push(emp);

    // User account so the employee can log in to the portal
    await User.create({
      organizationId: org._id,
      employeeId: emp._id,
      name: emp.name,
      email: emp.email,
      passwordHash: await User.hashPassword('EmployeePass!234'),
      role: ROLES.EMPLOYEE,
    });
  }

  // Signals: bias a few employees to be high/critical risk
  const highRiskIdx = new Set([0, 3, 7]);   // Critical-ish
  const medRiskIdx = new Set([1, 5, 9]);    // Medium-ish
  const periodEnd = new Date();

  const signalDocs = [];
  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const high = highRiskIdx.has(i);
    const med = medRiskIdx.has(i);

    const push = (category, metric, value) =>
      signalDocs.push({ organizationId: org._id, employeeId: emp._id, category, metric, value, periodEnd, source: 'system' });

    // Attendance
    push('attendance', 'late_arrivals_30d', high ? rand(5, 9) : med ? rand(2, 4) : rand(0, 2));
    push('attendance', 'early_logouts_30d', high ? rand(4, 8) : med ? rand(1, 3) : rand(0, 1));
    push('attendance', 'absent_days_30d', high ? rand(3, 6) : med ? rand(1, 2) : rand(0, 1));
    push('attendance', 'leave_freq_90d', high ? rand(7, 11) : med ? rand(3, 5) : rand(0, 3));
    push('attendance', 'unexplained_absences_30d', high ? rand(1, 3) : 0);

    // Performance
    push('performance', 'task_completion_rate', high ? rand(40, 60) : med ? rand(65, 80) : rand(85, 98));
    push('performance', 'overdue_tasks', high ? rand(5, 12) : med ? rand(2, 4) : rand(0, 2));
    push('performance', 'productivity_trend', high ? -0.4 : med ? -0.1 : 0.1);
    push('performance', 'project_contribution', high ? rand(20, 45) : med ? rand(50, 70) : rand(70, 95));
    push('performance', 'delivery_consistency', high ? rand(30, 55) : med ? rand(60, 80) : rand(80, 95));

    // Engagement
    push('engagement', 'meeting_participation', high ? rand(20, 40) : med ? rand(45, 65) : rand(70, 95));
    push('engagement', 'communication_drop', high ? 0.5 : med ? 0.25 : 0.05);

    // Behavioral
    push('behavioral', 'activity_decline_pct', high ? rand(35, 55) : med ? rand(15, 25) : rand(0, 10));
    push('behavioral', 'collaboration_drop_pct', high ? rand(35, 50) : med ? rand(15, 25) : rand(0, 10));
    push('behavioral', 'short_leave_freq', high ? rand(3, 6) : med ? rand(1, 2) : 0);
    push('behavioral', 'working_pattern_change', high ? 0.6 : med ? 0.3 : 0.1);

    // HR
    push('hr', 'unresolved_complaints', high ? rand(1, 2) : 0);
    push('hr', 'promotion_delay_months', high ? rand(12, 24) : med ? rand(6, 12) : 0);
    push('hr', 'training_completion_rate', high ? rand(25, 50) : med ? rand(60, 80) : rand(80, 100));
    push('hr', 'retention_conversation_count', high ? 1 : 0);
  }
  await Signal.insertMany(signalDocs);
  console.log('[seed] signals inserted:', signalDocs.length);

  // Pulse surveys (last 60 days, 2-4 per employee)
  const pulses = [];
  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const high = highRiskIdx.has(i);
    const med = medRiskIdx.has(i);
    const count = rand(2, 4);
    for (let j = 0; j < count; j++) {
      const daysAgo = rand(0, 60);
      const createdAt = new Date(Date.now() - daysAgo * 24 * 3600 * 1000);
      pulses.push({
        organizationId: org._id,
        employeeId: emp._id,
        moodScore: high ? rand(1, 2) : med ? rand(2, 3) : rand(3, 5),
        workloadScore: high ? rand(1, 2) : med ? rand(2, 3) : rand(3, 5),
        managerSupportScore: high ? rand(1, 2) : med ? rand(2, 4) : rand(3, 5),
        growthSatisfactionScore: high ? rand(1, 2) : med ? rand(2, 3) : rand(3, 5),
        createdAt,
      });
    }
  }
  await PulseSurvey.insertMany(pulses);
  console.log('[seed] pulses inserted:', pulses.length);

  // Compute initial risk for each employee
  for (const emp of employees) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const [signals, empPulses] = await Promise.all([
      Signal.find({ organizationId: org._id, employeeId: emp._id, periodEnd: { $gte: ninetyDaysAgo } }),
      PulseSurvey.find({ organizationId: org._id, employeeId: emp._id }).sort({ createdAt: -1 }).limit(5),
    ]);
    const result = calculateRisk({ employee: emp, signals, pulses: empPulses, priorAssessments: [] });
    await RiskAssessment.create({
      organizationId: org._id,
      employeeId: emp._id,
      ...result,
    });
    emp.currentRiskScore = result.riskScore;
    emp.currentRiskCategory = result.category;
    emp.currentRiskTrend = result.trend;
    emp.currentRiskUpdatedAt = new Date();
    await emp.save();
  }

  console.log('[seed] complete');
  console.log('  Super Admin: super@retainiq.dev / SuperPass!234');
  console.log('  Org Admin:   admin@acme.test / AdminPass!234');
  console.log('  HR Admin:    hr@acme.test / HrPass!234');
  console.log('  Manager:     manager1@acme.test / ManagerPass!234');
  console.log('  Employee:    emp1@acme.test / EmployeePass!234');

  // ----- Workforce Intelligence: 30 days of activity + productivity -----
  console.log('[seed] generating 30-day activity history…');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const activityDocs = [];
  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const high = highRiskIdx.has(i);     // these become "Needs Attention"
    const med  = medRiskIdx.has(i);      // these are "Stable"
    // 30 days of data, skip weekends mostly
    for (let d = 30; d >= 0; d--) {
      const date = new Date(today.getTime() - d * 24 * 3600 * 1000);
      const dow = date.getDay();
      if ((dow === 0 || dow === 6) && Math.random() > 0.15) continue;

      // Profiles
      let active, idle, meeting, breakM, completed, overdue, commits, prs, switches, deepM, deepN, total;
      if (high) {
        active = rand(180, 320);            // less active
        idle = rand(120, 240);
        meeting = rand(180, 300);            // many meetings
        breakM = rand(0, 15);
        completed = rand(0, 2);
        overdue = rand(2, 6);
        commits = rand(0, 2);
        prs = rand(0, 1);
        switches = rand(80, 140);
        deepM = rand(0, 30);
        deepN = rand(0, 1);
        total = rand(620, 720);              // 10-12 hours logged (overwork)
      } else if (med) {
        active = rand(280, 400);
        idle = rand(60, 120);
        meeting = rand(60, 150);
        breakM = rand(15, 30);
        completed = rand(2, 4);
        overdue = rand(1, 3);
        commits = rand(2, 5);
        prs = rand(0, 2);
        switches = rand(40, 80);
        deepM = rand(45, 90);
        deepN = rand(1, 3);
        total = rand(450, 540);
      } else {
        active = rand(360, 480);
        idle = rand(20, 60);
        meeting = rand(30, 120);
        breakM = rand(20, 45);
        completed = rand(3, 6);
        overdue = rand(0, 1);
        commits = rand(3, 8);
        prs = rand(1, 3);
        switches = rand(20, 60);
        deepM = rand(90, 180);
        deepN = rand(2, 5);
        total = rand(420, 520);
      }

      activityDocs.push({
        organizationId: org._id,
        employeeId: emp._id,
        date,
        activeMinutes: active,
        idleMinutes: idle,
        meetingMinutes: meeting,
        breakMinutes: breakM,
        totalLoggedMinutes: total,
        appUsageMinutes: {
          coding: high ? rand(20, 60) : rand(120, 240),
          communication: rand(40, 90),
          docs: rand(20, 60),
          design: rand(0, 40),
          meeting: meeting,
          idle: idle,
          other: rand(10, 40),
        },
        tasksCompleted: completed,
        tasksOverdue: overdue,
        commits, pullRequests: prs,
        ticketsResolved: rand(0, 2),
        appSwitchCount: switches,
        deepWorkSessions: deepN,
        deepWorkMinutes: deepM,
        source: 'system',
      });
    }
  }
  await ActivityLog.insertMany(activityDocs);
  console.log('[seed] activity logs inserted:', activityDocs.length);

  // Compute productivity scores per employee per day
  console.log('[seed] computing productivity scores…');
  let scoreCount = 0;
  const alertDocs = [];
  for (const emp of employees) {
    const empActivities = activityDocs
      .filter((a) => String(a.employeeId) === String(emp._id))
      .sort((a, b) => a.date - b.date);
    const historical = [];
    for (const activity of empActivities) {
      const result = calculateProductivity({ employee: emp, activity, historical: historical.slice(-14).reverse() });
      const doc = {
        organizationId: org._id, employeeId: emp._id, period: 'daily', date: activity.date,
        score: result.score, band: result.band,
        subScores: result.subScores, efficiency: result.efficiency,
        flags: result.flags, insights: result.insights, engineVersion: result.engineVersion,
      };
      historical.push({ score: result.score });
      await ProductivityScore.create(doc);
      scoreCount += 1;

      // Generate a sample of alerts for the most recent day's flags
      const isToday = activity.date.getTime() === today.getTime() ||
                      activity.date.getTime() === today.getTime() - 24 * 3600 * 1000;
      if (isToday) {
        if (result.flags.includes('overwork') || result.flags.includes('burnout_risk')) {
          alertDocs.push({
            organizationId: org._id, employeeId: emp._id,
            type: 'burnout_risk', severity: 'warning',
            title: `Burnout risk: ${emp.name}`,
            message: 'Sustained long hours combined with declining output.',
            metric: { score: result.score },
          });
        }
        if (result.flags.includes('meeting_overload')) {
          alertDocs.push({
            organizationId: org._id, employeeId: emp._id,
            type: 'meeting_overload', severity: 'info',
            title: `Meeting overload: ${emp.name}`,
            message: 'Meetings consuming more than half of working time.',
          });
        }
        if (result.band === 'High Performer' && result.score >= 80) {
          alertDocs.push({
            organizationId: org._id, employeeId: emp._id,
            type: 'high_performer', severity: 'info',
            title: `High performer: ${emp.name}`,
            message: `Sustained high productivity (${result.score}/100). Consider recognition.`,
          });
        }
      }
    }
    // Cache latest on Employee
    const last = historical[historical.length - 1];
    if (last) {
      emp.currentProductivityScore = last.score;
      emp.currentProductivityBand = last.score >= 75 ? 'High Performer' : last.score >= 50 ? 'Stable' : 'Needs Attention';
      emp.currentProductivityUpdatedAt = new Date();
      await emp.save();
    }
  }
  if (alertDocs.length) await Alert.insertMany(alertDocs);
  console.log(`[seed] productivity scores: ${scoreCount}, alerts: ${alertDocs.length}`);

  await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });

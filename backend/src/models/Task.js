const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 2000 },
    dueDate: { type: Date, default: null, index: true },
    status: { type: String, enum: ['pending', 'completed'], default: 'pending', index: true },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

taskSchema.index({ organizationId: 1, employeeId: 1, status: 1, dueDate: 1 });
taskSchema.index({ organizationId: 1, employeeId: 1, completedAt: 1 });

module.exports = mongoose.model('Task', taskSchema);

import type { AppointmentRow, StaffRow } from '@/data/types';

export function calendarColumns(staff: readonly StaffRow[]): StaffRow[] {
  return staff.filter((member) => member.active && member.takesBookings);
}

export function appointmentsForDay(rows: readonly AppointmentRow[], date: string): AppointmentRow[] {
  return rows.filter((appointment) => appointment.date === date);
}

export function appointmentBlockClass(status: AppointmentRow['status']): AppointmentRow['status'] {
  return status;
}

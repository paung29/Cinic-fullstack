import { describe, expect, test } from 'vitest';
import { isSlotOccupied } from '@/data/appointmentRecords';
import type { AppointmentRow, StaffRow } from '@/data/types';
import { appointmentBlockClass, appointmentsForDay, calendarColumns } from '@/modules/calendar/calendarSelectors';

const staff: StaffRow[] = [
  { id: 's1', name: 'Dr Hkawn Mai', role: 'admin', takesBookings: true, active: true },
  { id: 's2', name: 'Aye Aye', role: 'staff', takesBookings: false, active: true },
  { id: 's3', name: 'Former staff', role: 'staff', takesBookings: true, active: false },
];

const appointments: AppointmentRow[] = [
  { id: 'a1', staffId: 's1', patientId: 'c1', serviceId: 'v1', date: '2026-07-31', time: '09:30', status: 'booked', syncConflict: true },
  { id: 'a2', staffId: 's1', patientId: 'c2', serviceId: 'v1', date: '2026-07-31', time: '10:00', status: 'cancelled', syncConflict: false },
];

describe('calendar selectors', () => {
  test('shows only active bookable staff and same-day appointments without losing conflict state', () => {
    expect(calendarColumns(staff).map((member) => member.id)).toEqual(['s1']);
    expect(appointmentsForDay(appointments, '2026-07-31')).toEqual(appointments);
    expect(appointmentsForDay(appointments, '2026-08-01')).toEqual([]);
    expect(appointmentsForDay(appointments, '2026-07-31')[0]?.syncConflict).toBe(true);
  });

  test('uses the local booked/here occupancy rule', () => {
    expect(isSlotOccupied(appointments, 's1', '2026-07-31', '09:30')).toBe(true);
    expect(isSlotOccupied(appointments, 's1', '2026-07-31', '10:00')).toBe(false);
  });

  test('assigns a distinct visual treatment to every appointment status', () => {
    expect(appointmentBlockClass('booked')).toBe('booked');
    expect(appointmentBlockClass('here')).toBe('here');
    expect(appointmentBlockClass('done')).toBe('done');
    expect(appointmentBlockClass('cancelled')).toBe('cancelled');
  });
});

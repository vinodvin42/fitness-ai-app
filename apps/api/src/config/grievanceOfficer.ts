/**
 * Grievance officer (08.03 Complaints, Oct 2026). India's Consumer
 * Protection (E-Commerce) Rules 2020, rule 4(5), require the name,
 * designation and contact details of a grievance officer to be shown on
 * the platform. The owner has not supplied them yet, so every field is
 * null and the apps show "Not set yet". Fill these in (and redeploy the
 * API) once the owner sends them — never with placeholder values.
 */
export const GRIEVANCE_OFFICER: {
  name: string | null;
  designation: string | null;
  email: string | null;
} = {
  name: null,
  designation: null,
  email: null,
};

export function getGrievanceOfficer() {
  const { name, designation, email } = GRIEVANCE_OFFICER;
  return { name, designation, email, configured: Boolean(name && designation && email) };
}

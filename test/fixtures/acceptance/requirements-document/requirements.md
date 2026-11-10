# CareLink: requirements for the online consultation platform

Version 0.4, for architecture review. Owner: Digital Health programme.

## 1. Purpose

CareLink lets patients book and attend video consultations with clinicians in our network of clinics, see their consultation notes and prescriptions, and pay for private consultations. Clinicians use it to manage their calendars, run consultations and write notes.

## 2. Users

- Patients, on the web and on iOS and Android apps. 250,000 registered, about 40,000 active in a month.
- Clinicians and clinic staff, on the web only. About 1,200.
- Clinic administrators, on the web only.

## 3. Functional requirements

1. Patients register, sign in and verify their identity once with an identity verification provider.
2. Patients search clinicians by speciality, language and availability, and book, move or cancel an appointment.
3. Appointment reminders are sent by e-mail and SMS 24 hours and 1 hour before.
4. Consultations run as video calls in the browser or the app. We buy the video service; we do not build it.
5. Clinicians write consultation notes and issue electronic prescriptions, which go to the national e-prescription service.
6. Patients pay for private consultations by card. Card data never touches our systems; we use a payment provider.
7. Patients see their past appointments, notes and prescriptions.
8. Administrators see utilisation and no-show reports, refreshed nightly.
9. All access to patient records is audited and the audit trail is kept for 10 years.

## 4. Non-functional requirements

| Area | Requirement |
|---|---|
| Availability | 99.95% for booking and consultations, measured monthly |
| Latency | Search and booking answer within 800 ms for 99% of requests |
| Load | 300 requests per second at the Monday-morning peak; 25 concurrent video consultations per clinic at most |
| Data protection | Health data is special-category personal data under GDPR. It stays in the EU. Encrypted at rest and in transit. |
| Recovery | Booking and records: recovery point 5 minutes, recovery time 1 hour |
| Security | Clinicians sign in with the organisation's Entra ID and MFA; patients with e-mail and a one-time code |
| Cost | Run cost below EUR 30,000 a month, excluding the video and payment providers |

## 5. Constraints

- The organisation runs on Microsoft Azure and has an enterprise agreement. Other clouds need a business case.
- The patient record system of the clinics (on-premises, HL7 FHIR API) remains the system of record for clinical data. CareLink reads from it and writes notes back to it.
- The team is eight developers who know C# and TypeScript.

## 6. Open questions

- Whether consultation recordings are needed at all. Assume no for now.
- Whether a second Azure region is justified, or one region with three availability zones is enough.

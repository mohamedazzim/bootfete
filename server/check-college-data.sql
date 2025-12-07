-- Check recent registrations and their college data
SELECT 
    id,
    organizer_name,
    organizer_roll_no,
    organizer_dept,
    organizer_college,
    created_at
FROM registrations
ORDER BY created_at DESC
LIMIT 10;

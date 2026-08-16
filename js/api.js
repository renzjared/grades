const SUPABASE_URL = 'https://hjpihzsdebckouckxewi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqcGloenNkZWJja291Y2t4ZXdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4ODY2NjYsImV4cCI6MjA5NTQ2MjY2Nn0.XyXSuxb51G_08PLgrKwt1RvYmVwgIajqCnMWuS_V82c';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function generateId() { 
    return Math.random().toString(36).substr(2, 9); 
}
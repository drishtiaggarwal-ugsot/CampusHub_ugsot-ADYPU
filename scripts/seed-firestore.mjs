import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyA1Vem3KMiMuXssCXZQBA2xNUUAc5AJ2VQ',
  authDomain: 'campus-hub26.firebaseapp.com',
  projectId: 'campus-hub26',
  storageBucket: 'campus-hub26.firebasestorage.app',
  messagingSenderId: '699457039836',
  appId: '1:699457039836:web:c3c7f007440795f0da7319',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'default');

async function seedAll() {
  console.log('Seeding complete Firestore database collections...');
  const nowIso = new Date().toISOString();

  // 1. system_meta
  await setDoc(doc(db, 'system_meta', 'ping'), {
    status: 'active',
    databaseVersion: '2.0.0',
    initializedAt: nowIso,
    updatedBy: 'CampusHub Seed Engine',
  });
  console.log('✅ Collection [system_meta] created');

  // 2. profiles (Admin and active student builders for Squad-Up / Find Teammates)
  const profiles = [
    {
      id: 'admin_sahil',
      email: 'sahildehadray157@gmail.com',
      full_name: 'Sahil Dehadray',
      role: 'organizer',
      course_year: 'CSE · 3rd year',
      skills: ['React', 'TypeScript', 'Next.js', 'Firebase', 'System Design'],
      bio: 'Lead organizer & student developer at UGSOT ADYPU. Building campus innovation tools.',
      github_username: 'sahildehadray157',
      looking_for_team: true,
      onboarding_completed: true,
      dockers_count: 5,
      docking_count: 8,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: 'student_aarav',
      email: 'aarav.patil@adypu.edu.in',
      full_name: 'Aarav Patil',
      role: 'student',
      course_year: 'CSE · 3rd year',
      skills: ['React', 'Next.js', 'Tailwind CSS', 'JavaScript'],
      bio: 'Frontend specialist interested in interactive UI and real-time collaborative apps.',
      github_username: 'aarav-codes',
      looking_for_team: true,
      onboarding_completed: true,
      dockers_count: 4,
      docking_count: 6,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: 'student_sneha',
      email: 'sneha.kulkarni@adypu.edu.in',
      full_name: 'Sneha Kulkarni',
      role: 'student',
      course_year: 'AI & DS · 3rd year',
      skills: ['Python', 'PyTorch', 'AI/ML', 'Computer Vision'],
      bio: 'Machine learning developer working on edge vision models and Raspberry Pi IoT.',
      github_username: 'sneha-ml',
      looking_for_team: true,
      onboarding_completed: true,
      dockers_count: 7,
      docking_count: 5,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: 'student_rohan',
      email: 'rohan.sharma@adypu.edu.in',
      full_name: 'Rohan Sharma',
      role: 'student',
      course_year: 'IT · 2nd year',
      skills: ['Node.js', 'PostgreSQL', 'Docker', 'FastAPI'],
      bio: 'Backend enthusiast focused on microservices and low-latency API architectures.',
      github_username: 'rohan-dev',
      looking_for_team: true,
      onboarding_completed: true,
      dockers_count: 3,
      docking_count: 4,
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];

  for (const p of profiles) {
    await setDoc(doc(db, 'profiles', p.id), p);
  }
  console.log(`✅ Collection [profiles] populated (${profiles.length} profiles)`);

  // 3. event_catalog
  const events = [
    {
      id: 'smart-campus-hackathon-2026',
      title: 'Smart Campus 48H Hackathon 2026',
      category: 'Contest',
      description: 'The annual flagship UGSOT hackathon: build AI, IoT, and Web solutions for campus challenges.',
      mode: 'Offline',
      event_where: 'In campus',
      place: 'UGSOT Innovation Wing, Lab 304',
      start_date: '2026-12-05',
      end_date: '2026-12-07',
      registration_deadline: '2026-12-04',
      capacity: 120,
      is_published: true,
      event_type: 'event',
      noticeboard_managed: true,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: 'fullstack-web3-workshop',
      title: 'Modern Full-Stack & Cloud Architecture Workshop',
      category: 'Workshop',
      description: 'Hands-on session building serverless edge applications with Next.js 16 and Firebase.',
      mode: 'Offline',
      event_where: 'In campus',
      place: 'Seminar Hall B, ADYPU Campus',
      start_date: '2026-12-12',
      end_date: '2026-12-12',
      registration_deadline: '2026-12-10',
      capacity: 80,
      is_published: true,
      event_type: 'event',
      noticeboard_managed: true,
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];

  for (const ev of events) {
    await setDoc(doc(db, 'event_catalog', ev.id), ev);
  }
  console.log(`✅ Collection [event_catalog] populated (${events.length} events)`);

  // 4. hackathon_teams
  const teams = [
    {
      id: 'team-neuralhack',
      name: 'NeuralHack ADYPU',
      event_id: 'smart-campus-hackathon-2026',
      leader_id: 'admin_sahil',
      leader_email: 'sahildehadray157@gmail.com',
      member_emails: ['sahildehadray157@gmail.com', 'sneha.kulkarni@adypu.edu.in'],
      looking_for_members: true,
      roles_needed: ['Frontend UI Developer', 'Hardware IoT Specialist'],
      project_name: 'Smart Energy Grid IoT',
      project_description: 'Automated campus energy management using real-time occupancy sensor grids.',
      status: 'active',
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: 'team-cloudpulse',
      name: 'CloudPulse Dynamics',
      event_id: 'smart-campus-hackathon-2026',
      leader_id: 'student_aarav',
      leader_email: 'aarav.patil@adypu.edu.in',
      member_emails: ['aarav.patil@adypu.edu.in', 'rohan.sharma@adypu.edu.in'],
      looking_for_members: true,
      roles_needed: ['ML Engineer'],
      project_name: 'Campus Transit Tracker',
      project_description: 'Live bus schedule and transit synchronization for students and faculty.',
      status: 'active',
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];

  for (const t of teams) {
    await setDoc(doc(db, 'hackathon_teams', t.id), t);
  }
  console.log(`✅ Collection [hackathon_teams] populated (${teams.length} teams)`);

  // 5. forum_posts
  const posts = [
    {
      id: 'post-nextjs-16',
      type: 'question',
      title: 'How do I resolve Next.js 16 Server Component vs "use client" context errors?',
      content: 'I have an interactive form with state and onSubmit handlers inside an App Router page, but the production build failed prerendering because of it. What is the standard clean pattern to separate them?',
      author_id: 'student_aarav',
      tags: ['Web', 'JavaScript'],
      accepted_answer_id: 'ans-nextjs-1',
      is_reported: false,
      is_hidden: false,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: 'post-python-edge',
      type: 'question',
      title: 'Fastest way to run local ONNX or PyTorch models on Raspberry Pi 4?',
      content: 'We are developing an IoT camera edge detection node for the hackathon. Standard PyTorch takes ~850ms per frame. What runtime or quantization methods give under 100ms inference on ARM Cortex-A72?',
      author_id: 'student_sneha',
      tags: ['Python', 'AI/ML'],
      accepted_answer_id: 'ans-python-1',
      is_reported: false,
      is_hidden: false,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: 'post-welcome-announcement',
      type: 'announcement',
      title: 'Welcome to UGSOT CampusHub Community!',
      content: 'Official space for tech discussions, architecture questions, hackathon teammates, and updates.',
      author_id: 'admin_sahil',
      tags: ['Web', 'Git'],
      accepted_answer_id: null,
      is_reported: false,
      is_hidden: false,
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];

  for (const post of posts) {
    await setDoc(doc(db, 'forum_posts', post.id), post);
  }
  console.log(`✅ Collection [forum_posts] populated (${posts.length} posts)`);

  // 6. forum_answers
  const answers = [
    {
      id: 'ans-nextjs-1',
      post_id: 'post-nextjs-16',
      author_id: 'student_rohan',
      content: 'Extract the interactive form (with useState and onSubmit) into a separate Client Component with "use client" at top, and import it into your page.tsx Server Component.',
      is_reported: false,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: 'ans-python-1',
      post_id: 'post-python-edge',
      author_id: 'admin_sahil',
      content: 'Export your model to ONNX and use ONNX Runtime with INT8 dynamic quantization. On Raspberry Pi 4, inference latency drops to ~92ms.',
      is_reported: false,
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];

  for (const ans of answers) {
    await setDoc(doc(db, 'forum_answers', ans.id), ans);
  }
  console.log(`✅ Collection [forum_answers] populated (${answers.length} answers)`);

  console.log('\n🎉 ALL COLLECTIONS AND DOCUMENTS SUCCESSFULLY STORED IN CLOUD FIRESTORE!');
}

seedAll().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});

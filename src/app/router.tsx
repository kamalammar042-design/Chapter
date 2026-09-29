import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { RedirectIfAuthed, RequireAuth, RequireOnboarded } from '@/features/auth/guards';
import { RouteError } from './RouteError';

// Route-level code splitting: each page loads on demand.
const Landing = lazy(() => import('@/features/landing/Landing'));
const SignIn = lazy(() => import('@/features/auth/SignIn'));
const SignUp = lazy(() => import('@/features/auth/SignUp'));
const ForgotPassword = lazy(() => import('@/features/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('@/features/auth/ResetPassword'));
const AuthCallback = lazy(() => import('@/features/auth/AuthCallback'));
const Legal = lazy(() => import('@/features/landing/Legal'));
const Onboarding = lazy(() => import('@/features/onboarding/Onboarding'));
const Home = lazy(() => import('@/features/home/Home'));
const Study = lazy(() => import('@/features/study/Study'));
const SubjectPage = lazy(() => import('@/features/study/SubjectPage'));
const Practice = lazy(() => import('@/features/study/Practice'));
const Written = lazy(() => import('@/features/study/Written'));
const Tutor = lazy(() => import('@/features/tutor/Tutor'));
const Papers = lazy(() => import('@/features/papers/Papers'));
const Notes = lazy(() => import('@/features/notes/Notes'));
const NoteEditor = lazy(() => import('@/features/notes/NoteEditor'));
const Flashcards = lazy(() => import('@/features/flashcards/Flashcards'));
const DeckPage = lazy(() => import('@/features/flashcards/DeckPage'));
const Review = lazy(() => import('@/features/flashcards/Review'));
const Progress = lazy(() => import('@/features/progress/Progress'));
const Reports = lazy(() => import('@/features/reports/Reports'));
const Goals = lazy(() => import('@/features/goals/Goals'));
const ExamPlan = lazy(() => import('@/features/plan/ExamPlan'));
const Admin = lazy(() => import('@/features/admin/Admin'));
const Leagues = lazy(() => import('@/features/leagues/Leagues'));
const Settings = lazy(() => import('@/features/settings/Settings'));
const More = lazy(() => import('@/features/more/More'));
const ParentHome = lazy(() => import('@/features/parent/ParentHome'));
const NotFound = lazy(() => import('./NotFound'));

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <RedirectIfAuthed><Landing /></RedirectIfAuthed> },
      { path: '/signin', element: <RedirectIfAuthed><SignIn /></RedirectIfAuthed> },
      { path: '/signup', element: <RedirectIfAuthed><SignUp /></RedirectIfAuthed> },
      { path: '/forgot-password', element: <ForgotPassword /> },
      { path: '/reset-password', element: <ResetPassword /> },
      { path: '/auth/callback', element: <AuthCallback /> },
      { path: '/privacy', element: <Legal doc="privacy" /> },
      { path: '/terms', element: <Legal doc="terms" /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/onboarding', element: <Onboarding /> },
          {
            element: <RequireOnboarded />,
            children: [
              {
                element: <AppShell />,
                children: [
                  { path: '/home', element: <Home /> },
                  { path: '/study', element: <Study /> },
                  { path: '/study/:subjectKey', element: <SubjectPage /> },
                  { path: '/practice', element: <Practice /> },
                  { path: '/reading', element: <Navigate to="/study" replace /> },
                  { path: '/written', element: <Written /> },
                  { path: '/tutor', element: <Tutor /> },
                  { path: '/tutor/:conversationId', element: <Tutor /> },
                  { path: '/papers', element: <Papers /> },
                  { path: '/notes', element: <Notes /> },
                  { path: '/notes/:noteId', element: <NoteEditor /> },
                  { path: '/flashcards', element: <Flashcards /> },
                  { path: '/flashcards/:deckId', element: <DeckPage /> },
                  { path: '/review', element: <Review /> },
                  { path: '/progress', element: <Progress /> },
                  { path: '/reports', element: <Reports /> },
                  { path: '/goals', element: <Goals /> },
                  { path: '/plan', element: <ExamPlan /> },
                  { path: '/admin', element: <Admin /> },
                  { path: '/leagues', element: <Leagues /> },
                  { path: '/more', element: <More /> },
                  { path: '/settings', element: <Settings /> },
                  { path: '/settings/:section', element: <Settings /> },
                  { path: '/parent', element: <ParentHome /> },
                  { path: '/parent/:studentId', element: <ParentHome /> },
                ],
              },
            ],
          },
        ],
      },
      { path: '/dashboard', element: <Navigate to="/home" replace /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

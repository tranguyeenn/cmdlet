export type SheetFormId =
  | "classes"
  | "assignments"
  | "exams"
  | "projects"
  | "books"
  | "tasks"
  | "events"
  | "notes"
  | "life";

export interface FormField {
  key: string;
  label: string;
  hint?: string;
}

export interface SheetFormSchema {
  id: SheetFormId;
  label: string;
  fields: FormField[];
  autoFields?: Array<{ key: string; value: () => string }>;
  /** Column used to find a row when editing or deleting. */
  lookupField: string;
}

function todayLabel(): string {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const SHEET_FORMS: Record<SheetFormId, SheetFormSchema> = {
  classes: {
    id: "classes",
    label: "Class",
    lookupField: "course",
    fields: [
      { key: "course", label: "Course" },
      { key: "professor", label: "Professor" },
      { key: "credits", label: "Credits" },
      { key: "semester", label: "Semester" },
      { key: "currentGrade", label: "Current Grade" },
      { key: "targetGrade", label: "Target Grade" },
      { key: "notes", label: "Notes" },
    ],
  },
  assignments: {
    id: "assignments",
    label: "Assignment",
    lookupField: "assignment",
    fields: [
      { key: "course", label: "Course" },
      { key: "assignment", label: "Assignment" },
      { key: "dueDate", label: "Due Date", hint: "YYYY-MM-DD or Friday" },
      { key: "priority", label: "Priority", hint: "Low, Medium, High" },
      { key: "status", label: "Status", hint: "Not Started, In Progress, Done" },
      { key: "estimatedHours", label: "Estimated Hours" },
      { key: "actualHours", label: "Actual Hours" },
      { key: "notes", label: "Notes" },
    ],
  },
  exams: {
    id: "exams",
    label: "Exam",
    lookupField: "examName",
    fields: [
      { key: "course", label: "Course" },
      { key: "examName", label: "Exam Name" },
      { key: "examDate", label: "Exam Date", hint: "YYYY-MM-DD or Friday" },
      { key: "weight", label: "Weight" },
      { key: "score", label: "Score" },
      { key: "studyStatus", label: "Study Status", hint: "Not Started, Reviewing, Ready, Completed" },
      { key: "notes", label: "Notes" },
    ],
  },
  projects: {
    id: "projects",
    label: "Project",
    lookupField: "project",
    fields: [
      { key: "project", label: "Project" },
      { key: "category", label: "Category" },
      { key: "status", label: "Status", hint: "Idea, Planning, Building, Testing, Released, Archived" },
      { key: "milestone", label: "Milestone" },
      { key: "deadline", label: "Deadline", hint: "YYYY-MM-DD or Friday" },
      { key: "githubLink", label: "GitHub Link" },
      { key: "notes", label: "Notes" },
    ],
  },
  books: {
    id: "books",
    label: "Book",
    lookupField: "title",
    fields: [
      { key: "title", label: "Title" },
      { key: "author", label: "Author" },
      { key: "status", label: "Status", hint: "To Read, Reading, Finished, DNF" },
      { key: "startDate", label: "Start Date", hint: "YYYY-MM-DD" },
      { key: "finishDate", label: "Finish Date", hint: "YYYY-MM-DD" },
      { key: "currentPage", label: "Current Page" },
      { key: "totalPages", label: "Total Pages" },
      { key: "rating", label: "Rating" },
      { key: "notes", label: "Notes" },
    ],
  },
  tasks: {
    id: "tasks",
    label: "Task",
    lookupField: "title",
    fields: [
      { key: "title", label: "Title" },
      { key: "category", label: "Category" },
      { key: "dueDate", label: "Due Date", hint: "YYYY-MM-DD or tomorrow" },
      { key: "dueTime", label: "Due Time", hint: "17:00 or 2pm" },
      { key: "status", label: "Status", hint: "Not Started, In Progress, Done" },
      { key: "notes", label: "Notes" },
    ],
  },
  events: {
    id: "events",
    label: "Event",
    lookupField: "title",
    fields: [
      { key: "title", label: "Title" },
      { key: "date", label: "Date", hint: "YYYY-MM-DD or Friday" },
      { key: "startTime", label: "Start Time", hint: "10:00 or 2pm" },
      { key: "endTime", label: "End Time", hint: "12:00 or 4pm" },
      { key: "notes", label: "Notes" },
    ],
  },
  notes: {
    id: "notes",
    label: "Note",
    lookupField: "title",
    fields: [
      { key: "title", label: "Title" },
      { key: "content", label: "Content" },
    ],
    autoFields: [{ key: "created", value: todayLabel }],
  },
  life: {
    id: "life",
    label: "Life entry",
    lookupField: "date",
    fields: [
      { key: "sleepHours", label: "Sleep Hours" },
      { key: "mood", label: "Mood", hint: "Low, Okay, Good, Great" },
      { key: "energy", label: "Energy", hint: "Low, Medium, High" },
      { key: "studyHours", label: "Study Hours" },
      { key: "codingHours", label: "Coding Hours" },
      { key: "readingPages", label: "Reading Pages" },
      { key: "notes", label: "Notes" },
    ],
    autoFields: [{ key: "date", value: todayLabel }],
  },
};

import { eq } from "drizzle-orm";
import { guardians, programs, students } from "@/server/db/schema";
import type { DB } from "@/server/db/types";
import { today } from "@/lib/dates";
import { nextCounter } from "./counters";
import { audit } from "./audit";
import { DomainError } from "./errors";

export type NewStudent = {
  fullName: string; email?: string; phone?: string; dateOfBirth?: string; programId?: string;
  guardianName?: string; guardianRelationship?: string; guardianPhone?: string;
};

export async function registerStudent(db: DB, input: NewStudent, userId: string) {
  return db.transaction(async (tx) => {
    if (input.programId) {
      const [p] = await tx.select({ id: programs.id }).from(programs).where(eq(programs.id, input.programId));
      if (!p) throw new DomainError("Selected program does not exist");
    }
    const enrollmentDate = today();
    const year = enrollmentDate.slice(0, 4);
    const seq = await nextCounter(tx, `student-${year}`);
    const studentCode = `GJS-${year}-${String(seq).padStart(4, "0")}`;

    const [student] = await tx.insert(students).values({
      studentCode,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      dateOfBirth: input.dateOfBirth,
      programId: input.programId,
      enrollmentDate,
    }).returning({ id: students.id, studentCode: students.studentCode });

    if (input.guardianName) {
      await tx.insert(guardians).values({
        studentId: student.id,
        name: input.guardianName,
        relationship: input.guardianRelationship,
        phone: input.guardianPhone,
      });
    }
    await audit(tx, { userId, action: "student.create", entity: "student", entityId: student.id, detail: { studentCode } });
    return student;
  });
}

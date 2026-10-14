import { z } from "zod/v4";

export const ProblemPageInfoSchema = z.object({
    problemNumber: z.string().describe("The problem number"),
    questionPages: z.array(z.number()).describe("List of pages with the question"),
    answerPages: z.array(z.number()).describe("List of pages with the answer")
}).describe("A problem with its number and the pages it appears on")
export type ProblemPageInfo = z.infer<typeof ProblemPageInfoSchema>;

export type MergePages = {
    pages:number[]
    problems:ProblemPageInfo[]
}
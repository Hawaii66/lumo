import { describe, expect, it } from "vitest";
import {
  isUnderCoursePrefix,
  parseMaiCourseRoot,
} from "./maiCourseUrl";

describe("parseMaiCourseRoot", () => {
  it("accepts course roots with trailing slash", () => {
    expect(parseMaiCourseRoot("https://courses.mai.liu.se/GU/TATA41/")).toEqual({
      rootUrl: "https://courses.mai.liu.se/GU/TATA41/",
      coursePrefix: "/GU/TATA41/",
      courseCode: "TATA41",
    });
  });

  it("accepts http and index.html variants", () => {
    expect(
      parseMaiCourseRoot("http://courses.mai.liu.se/GU/TATA41/index.html"),
    ).toEqual({
      rootUrl: "https://courses.mai.liu.se/GU/TATA41/",
      coursePrefix: "/GU/TATA41/",
      courseCode: "TATA41",
    });
  });

  it("rejects subpages", () => {
    expect(() =>
      parseMaiCourseRoot("https://courses.mai.liu.se/GU/TATA41/tentor.html"),
    ).toThrow(/startsida/i);
  });

  it("rejects other hosts", () => {
    expect(() => parseMaiCourseRoot("https://example.com/GU/TATA41/")).toThrow(
      /courses\.mai\.liu\.se/,
    );
  });

  it("rejects PDF links", () => {
    expect(() =>
      parseMaiCourseRoot(
        "https://courses.mai.liu.se/GU/TATA41/Dokument/tentatips.pdf",
      ),
    ).toThrow(/startsida/i);
  });
});

describe("isUnderCoursePrefix", () => {
  const prefix = "/GU/TATA41/";

  it("allows same-course pages and PDFs", () => {
    expect(
      isUnderCoursePrefix(
        "https://courses.mai.liu.se/GU/TATA41/tentor.html",
        prefix,
      ),
    ).toBe(true);
    expect(
      isUnderCoursePrefix(
        "https://courses.mai.liu.se/GU/TATA41/Tentor/T260114.pdf",
        prefix,
      ),
    ).toBe(true);
  });

  it("rejects other courses and site nav", () => {
    expect(
      isUnderCoursePrefix("https://courses.mai.liu.se/GU/TATM79/", prefix),
    ).toBe(false);
    expect(
      isUnderCoursePrefix("https://courses.mai.liu.se/Lists/html/", prefix),
    ).toBe(false);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/**
 * Profile photo (20 Oct 2026): GET/PUT/DELETE /users/me/photo. The member
 * sets their own picture by taking a photo or choosing one from the gallery
 * in the app. See the UserProfilePhoto model in schema.prisma.
 */
describe("Profile photo", () => {
  const app = buildApp();
  let userId: string;
  let accessToken: string;
  const auth = () => ({ Authorization: `Bearer ${accessToken}` });
  const dataUri = (type: "jpeg" | "png", bytes: number[]) =>
    `data:image/${type};base64,${Buffer.from([...bytes, ...Array.from({ length: 64 }, (_, i) => i)]).toString("base64")}`;
  const JPEG = dataUri("jpeg", [0xff, 0xd8, 0xff, 0xe0]);
  const PNG = dataUri("png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  beforeAll(async () => {
    const signup = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("photo"), password: "SomePassword1!", fullName: "Photo Tester" });
    userId = signup.body.user.id;
    accessToken = signup.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.userDataExport.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("needs sign-in", async () => {
    expect((await request(app).get("/users/me/photo")).status).toBe(401);
    expect((await request(app).put("/users/me/photo").send({ imageData: JPEG })).status).toBe(401);
    expect((await request(app).delete("/users/me/photo")).status).toBe(401);
  });

  it("starts with no photo", async () => {
    const res = await request(app).get("/users/me/photo").set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ photo: null });
  });

  it("saves a JPEG, returns it, and replaces it with a PNG", async () => {
    const put = await request(app).put("/users/me/photo").set(auth()).send({ imageData: JPEG });
    expect(put.status).toBe(200);
    expect(put.body.photo.imageData).toBe(JPEG);
    const got = await request(app).get("/users/me/photo").set(auth());
    expect(got.body.photo).toEqual({ imageData: JPEG, updatedAt: put.body.photo.updatedAt });

    const replaced = await request(app).put("/users/me/photo").set(auth()).send({ imageData: PNG });
    expect(replaced.status).toBe(200);
    expect(replaced.body.photo.imageData).toBe(PNG);
    expect(await prisma.userProfilePhoto.count({ where: { userId } })).toBe(1);
  });

  it("refuses anything that isn't a JPEG or PNG photo, or is too large", async () => {
    const send = (imageData: unknown) => request(app).put("/users/me/photo").set(auth()).send({ imageData });
    expect((await send("https://example.com/me.jpg")).status).toBe(400);
    expect((await send(`data:image/gif;base64,${Buffer.from("GIF89a").toString("base64")}`)).status).toBe(400);
    expect((await send(`data:text/html;base64,${Buffer.from("<script>").toString("base64")}`)).status).toBe(400);
    // Claims to be a JPEG but the bytes are text.
    const fake = await send(`data:image/jpeg;base64,${Buffer.from("not really an image at all").toString("base64")}`);
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe("invalid_image");
    const huge = await send(`data:image/jpeg;base64,/9j/${"A".repeat(1_400_000)}`);
    expect(huge.status).toBe(400);
    // The PNG from the previous test is untouched.
    expect((await request(app).get("/users/me/photo").set(auth())).body.photo.imageData).toBe(PNG);
  });

  it("is included in Download my data", async () => {
    const created = await request(app).post("/users/me/exports").set(auth());
    expect(created.status).toBe(201);
    expect(created.body.files.map((f: { name: string }) => f.name)).toContain("profile_photo.png");
  });

  it("removes the photo, and removing again is fine", async () => {
    expect((await request(app).delete("/users/me/photo").set(auth())).status).toBe(204);
    expect((await request(app).get("/users/me/photo").set(auth())).body).toEqual({ photo: null });
    expect((await request(app).delete("/users/me/photo").set(auth())).status).toBe(204);
  });

  it("is deleted with the account", async () => {
    await request(app).put("/users/me/photo").set(auth()).send({ imageData: JPEG });
    await prisma.userDataExport.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    expect(await prisma.userProfilePhoto.count({ where: { userId } })).toBe(0);
  });
});

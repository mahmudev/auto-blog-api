const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const Parser = require("rss-parser");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djzcyyl.mongodb.net/`;

async function run() {
  try {
    const client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });

    await client.connect();
    console.log("Connected to MongoDB!");

    const db = client.db("blogDB");
    const blogsCollection = db.collection("blogposts");

    const parser = new Parser();

    cron.schedule("*/60 * * * *", async () => {
      try {
        let feed = await parser.parseURL("https://www.vg247.com/feed");
        for (const item of feed.items) {
          const existingPost = await blogsCollection.findOne({
            title: item.title,
          });
          if (existingPost) {
            console.log(
              "Skipping - Post with this title already exists:",
              item.title
            );
            continue;
          }
          const imageRegex = /<img[^>]+src="([^">]+)"/;
          const imageMatch = item.content.match(imageRegex);
          let imageUrl = "";
          if (imageMatch) {
            imageUrl = imageMatch[1];
          }
          const categories = item.categories.map((category) => category);

          const blogPost = {
            title: item.title,
            imageURL: imageUrl,
            articleLink: item.link,
            pubDate: new Date(item.pubDate),
            categories: categories,
            status: "draft", // Default value for status is 'draft'
          };

          await blogsCollection.insertOne(blogPost);
          console.log("Post saved to the database.");
        }
      } catch (err) {
        console.error("Error fetching or parsing the feed:", err);
      }
    });

    cron.schedule("*/30 * * * *", async () => {
      try {
        const oldestDraft = await blogsCollection.findOne(
          { status: "draft" },
          { sort: { pubDate: 1 } }
        );

        if (oldestDraft) {
          await blogsCollection.updateOne(
            { _id: oldestDraft._id },
            { $set: { status: "published" } }
          );
          console.log(`Blog post "${oldestDraft.title}" is now published.`);
        }
      } catch (err) {
        console.error("Error updating blog post status:", err);
      }
    });

    app.use(cors());
    app.use(express.json());

    app.get("/blogs", async (req, res) => {
      try {
        const publishedBlogs = await blogsCollection
          .find({ status: "published" })
          .toArray();
        res.json(publishedBlogs);
      } catch (err) {
        res
          .status(500)
          .json({ error: "Failed to fetch blogs from the database." });
      }
    });
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server running....");
});
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

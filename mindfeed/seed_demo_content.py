"""Idempotently add a varied MindFeed demonstration feed (does not delete user data)."""
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, func
from backend.app import SessionLocal, User, UserPreference, Post, Base, engine

# Stable, public Unsplash image URLs commonly used for visual examples. External URL availability
# depends on the network; the seed never downloads media or claims external reachability was tested.
IMAGES = [
 "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80",
 "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&auto=format&fit=crop&q=80",
 "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200&auto=format&fit=crop&q=80",
 "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200&auto=format&fit=crop&q=80",
 "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1200&auto=format&fit=crop&q=80",
 "https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=1200&auto=format&fit=crop&q=80",
 "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&auto=format&fit=crop&q=80",
 "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=1200&auto=format&fit=crop&q=80",
 "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=1200&auto=format&fit=crop&q=80",
 "https://images.unsplash.com/photo-1472396961693-142e6e269027?w=1200&auto=format&fit=crop&q=80",
 "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200&auto=format&fit=crop&q=80",
 "https://images.unsplash.com/photo-1500534623283-312aade485b7?w=1200&auto=format&fit=crop&q=80",
 "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=1200&auto=format&fit=crop&q=80",
 "https://images.unsplash.com/photo-1519682337058-a94d519337bc?w=1200&auto=format&fit=crop&q=80",
 "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1200&auto=format&fit=crop&q=80",
 "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=1200&auto=format&fit=crop&q=80",
 "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?w=1200&auto=format&fit=crop&q=80",
 "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=1200&auto=format&fit=crop&q=80",
]
TOPICS = ["Technology", "Science", "Learning", "Design", "Career", "News & Information", "Entertainment", "Sports & Fitness", "Nature", "Sustainability", "Art & Creativity", "Photography"]
ITEMS = [
("A tiny accessibility improvement can change whether someone can participate at all. Test keyboard navigation before calling a screen finished.","Design","Post",None),
("The best way to learn a difficult idea is to explain it in your own words, then find the gap in your explanation.","Learning","Post",None),
("A useful technology question: does this feature give people more control, or simply ask for more attention?","Technology","Post",None),
("Science gets stronger when results can be repeated and uncertainty is reported honestly.","Science","Photo",IMAGES[5]),
("Career note: keep a small log of problems you solved. It makes interviews more concrete and helps you notice growth.","Career","Post",None),
("Before sharing a breaking-news screenshot, look for the original report, publication date, and independent confirmation.","News & Information","Post",None),
("A reminder that a hobby does not need to become a side hustle to be worthwhile.","Entertainment","Photo",IMAGES[12]),
("Movement is easier to sustain when the goal is consistency rather than a perfect workout.","Sports & Fitness","Photo",IMAGES[14]),
("A few minutes outside can be a good reset between long stretches of screen time.","Nature","Photo",IMAGES[8]),
("Sustainability often starts with making the lower-waste choice the convenient choice.","Sustainability","Photo",IMAGES[10]),
("Try making one quick sketch before looking for inspiration. Your first draft is allowed to be messy.","Art & Creativity","Photo",IMAGES[12]),
("Photography challenge: choose one colour and notice how many different places it appears in a single walk.","Photography","Photo",IMAGES[9]),
("A good project README should explain what it does, how to run it, and what is still unfinished.","Technology","Post",None),
("A spaced-repetition card works best when it asks one clear question instead of copying a whole paragraph.","Learning","Post",None),
("When a chart looks surprising, check the axis range and sample size before drawing a conclusion.","Science","Photo",IMAGES[4]),
("Small interface details matter: focus states, readable contrast, and labels help people use a product confidently.","Design","Photo",IMAGES[2]),
("Ask a teammate what success looks like before you start building. It saves rework later.","Career","Post",None),
("A headline is a starting point, not the full story. Read beyond it when a claim matters.","News & Information","Post",None),
("A playlist can set a mood, but silence can also be a useful creative tool.","Entertainment","Post",None),
("Rest days are part of training. Recovery is not a failure to be productive.","Sports & Fitness","Photo",IMAGES[15]),
("Notice the tiny details in a familiar tree or street. Familiar places still have surprises.","Nature","Photo",IMAGES[11]),
("Repairing, borrowing, and reusing can be practical alternatives to buying something new.","Sustainability","Post",None),
("Try a limited palette for your next creative project. Constraints can make decisions easier.","Art & Creativity","Photo",IMAGES[12]),
("Golden-hour photos are lovely, but soft shade can give portraits even light too.","Photography","Photo",IMAGES[7]),
("Write a test for the bug you just fixed. It turns today's fix into tomorrow's protection.","Technology","Post",None),
("A focused 20-minute session with a clear question can beat an hour of distracted rereading.","Learning","Post",None),
("Correlation can point to a question worth investigating; it does not automatically explain why something happened.","Science","Post",None),
("The strongest onboarding flows explain why a permission is needed before asking for it.","Design","Photo",IMAGES[16]),
("Portfolio tip: describe the problem, your contribution, trade-offs, and what you would improve next.","Career","Post",None),
("Check the date on a recycled clip. Old footage can be presented as if it happened today.","News & Information","Post",None),
("Share the recommendation, not just the rating: context helps people decide if it fits them.","Entertainment","Post",None),
("A comfortable walking pace is one where you can still talk. Start where you are.","Sports & Fitness","Photo",IMAGES[15]),
("Clouds, shadows, and reflections can turn an ordinary walk into a small field study.","Nature","Photo",IMAGES[8]),
("Energy-saving settings are useful when they are easy to discover and do not hide important trade-offs.","Sustainability","Post",None),
("Collect references, then close them and make something from memory. It helps your own taste emerge.","Art & Creativity","Photo",IMAGES[12]),
("Try taking a photo from a lower angle; changing perspective can make an ordinary subject feel new.","Photography","Photo",IMAGES[9]),
("Use descriptive error messages that tell people what happened and what they can do next.","Technology","Post",None),
("Teach-back method: after reading, explain the idea as if you were helping a friend who is new to it.","Learning","Post",None),
("Good experiments change one important variable at a time where practical, and record the conditions.","Science","Photo",IMAGES[5]),
("Design systems are not only about consistency; they also help teams make changes safely.","Design","Photo",IMAGES[2]),
("A thoughtful question at the end of a project review can be more useful than a list of vague improvements.","Career","Post",None),
("When a post cites a study, follow the link and check whether the study supports the claim being made.","News & Information","Post",None),
("A short break from notifications can make room for a longer conversation.","Entertainment","Post",None),
("Try a warm-up that matches the activity you plan to do, and stop if something hurts.","Sports & Fitness","Photo",IMAGES[14]),
("Leave a place better than you found it. Small local actions add up when shared by many people.","Nature","Photo",IMAGES[10]),
("A reusable item only helps when it fits your real routine. Practical beats aspirational clutter.","Sustainability","Post",None),
("Creative practice is easier to keep when the materials are already within reach.","Art & Creativity","Photo",IMAGES[12]),
("Try a frame within the frame: a doorway, branches, or a window can guide the eye.","Photography","Photo",IMAGES[9]),
("If a feature needs a special-case workaround, document the reason so the next maintainer understands it.","Technology","Post",None),
("Make a tiny study plan: one topic, one task, and one stopping point.","Learning","Post",None),
("Scientific literacy includes knowing when the available evidence is not enough for a confident answer.","Science","Photo",IMAGES[4]),
("A calm interface does not have to be empty. Clear hierarchy can make a rich screen feel manageable.","Design","Photo",IMAGES[16]),
("Ask for feedback on one specific thing. It makes it easier for others to give useful advice.","Career","Post",None),
("Separate what is known, what is alleged, and what remains unverified when discussing a developing story.","News & Information","Post",None),
("Memes can be funny and still benefit from context when they include claims about real people.","Entertainment","Post",None),
("Pick a movement you enjoy enough to repeat. Sustainable routines beat short bursts of perfection.","Sports & Fitness","Photo",IMAGES[15]),
("Take a moment to listen to the environment around you. Not every moment needs to be documented.","Nature","Photo",IMAGES[11]),
("The greenest purchase may be the one you do not need to make today.","Sustainability","Post",None),
("Try making a small series around one theme instead of waiting for one perfect piece.","Art & Creativity","Photo",IMAGES[12]),
("A simple composition exercise: place the subject off-centre and leave intentional negative space.","Photography","Photo",IMAGES[7]),
("A short nature clip for a mindful pause: notice the movement, light, and small details.","Nature","Video","https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"),
("Video storytelling tip: keep the first seconds clear and give viewers context before adding effects.","Art & Creativity","Video","https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"),
("Try watching a short clip without multitasking, then write down one detail you might have missed.","Learning","Video","https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"),
]

def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        users = db.scalars(select(User).where(User.email.like("%.sample@mindfeed.local"))).all()
        demo = db.scalar(select(User).where(User.email == "demo@mindfeed.local"))
        authors = ([demo] if demo else []) + users
        if not authors:
            print("No seeded demo users found. Start the app once, then run this command again.")
            return
        existing = {p.content for p in db.scalars(select(Post).where(Post.is_sample.is_(True))).all()}
        now = datetime.now(timezone.utc)
        added = 0
        for idx, (content, topic, fmt, media) in enumerate(ITEMS):
            content = f"{content} #MindFeed #{topic.replace(' & ', '').replace(' ', '')}"
            if content in existing: continue
            author = authors[idx % len(authors)]
            db.add(Post(user_id=author.id, content=content, topic=topic, format=fmt, image_url=media, status="approved", is_sample=True, likes_count=(idx * 13 + 7) % 240, created_at=now - timedelta(minutes=idx * 19)))
            existing.add(content); added += 1
        db.commit()
        count = db.scalar(select(func.count(Post.id)).where(Post.is_sample.is_(True))) or 0
        print(f"Added {added} demonstration posts. Total demonstration posts: {count}. No existing records were deleted.")
    finally: db.close()

if __name__ == "__main__": main()

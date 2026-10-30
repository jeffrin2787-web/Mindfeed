"""End-to-end API smoke tests for MindFeed's primary workflows."""
import os
import re
import sys
from pathlib import Path
from uuid import uuid4

# Isolate tests from a user's runtime database. A new DB is created for every test run.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))
TEST_DB = Path(__file__).resolve().parent / "mindfeed_test.db"
if TEST_DB.exists():
    TEST_DB.unlink()
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SECRET_KEY"] = "test-only-secret-do-not-use-in-production"
os.environ["ENABLE_DEMO_LOGIN"] = "true"

from fastapi.testclient import TestClient  # noqa: E402
from backend.app import app  # noqa: E402


def test_health_and_static_frontend():
    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["database"] == "connected"
        page = client.get("/")
        assert page.status_code == 200
        assert "MindFeed" in page.text
        scripts = re.findall(r'<script[^>]+src="([^"]+)"', page.text)
        assert scripts and all(client.get(script).status_code == 200 for script in scripts)
        assert client.get("/robots.txt").status_code == 200
        assert client.get("/sitemap.xml").status_code == 200
        assert client.get("/llms.txt").status_code == 200
        assert client.get("/family-controls").status_code == 200
        missing = client.get("/definitely-not-a-real-mindfeed-page")
        assert missing.status_code == 404 and "MindFeed" in missing.text


def test_signup_prefs_feed_post_like_search_and_feedback():
    with TestClient(app) as client:
        signup = client.post("/api/auth/register", json={"name": "Casey Tester", "email": f"casey-{uuid4().hex[:8]}@example.com", "password": "secure-test-pass-73"})
        assert signup.status_code == 201, signup.text
        token = signup.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        assert client.get("/api/auth/me", headers=headers).status_code == 200
        prefs = client.put("/api/preferences", headers=headers, json={"interests": ["Technology", "Science"], "study_mode": False, "reduce_repetition": True})
        assert prefs.status_code == 200
        assert "Technology" in prefs.json()["preferences"]["interests"]
        feed = client.get("/api/feed", headers=headers)
        assert feed.status_code == 200 and "items" in feed.json()
        post = client.post("/api/posts", headers=headers, json={"content": "A thoughtful note about building accessible technology for everyone.", "topic": "Technology", "format": "Post"})
        assert post.status_code == 201, post.text
        post_id = post.json()["post"]["id"]
        assert post.json()["post"]["status"] == "approved"
        liked = client.post(f"/api/posts/{post_id}/like", headers=headers, json={})
        assert liked.status_code == 200 and liked.json()["liked"] is True
        feedback = client.post(f"/api/posts/{post_id}/feedback", headers=headers, json={"action": "show_more"})
        assert feedback.status_code == 200
        search = client.get("/api/search", headers=headers, params={"q": "accessible technology"})
        assert search.status_code == 200
        mine = client.get("/api/posts/mine", headers=headers)
        assert any(p["id"] == post_id for p in mine.json()["items"])


def test_truthcheck_and_reports():
    with TestClient(app) as client:
        auth = client.post("/api/auth/demo", json={}).json()
        headers = {"Authorization": f"Bearer {auth['access_token']}"}
        result = client.post("/api/truthcheck", headers=headers, json={"claim": "The Earth orbits the Sun."})
        assert result.status_code == 200
        assert result.json()["status"] == "supported"
        assert result.json()["evidence"]
        history = client.get("/api/truthcheck/history", headers=headers)
        assert history.status_code == 200 and len(history.json()["items"]) >= 1
        report = client.post("/api/reports", headers=headers, json={"target_type": "other", "reason": "Test report", "details": "Testing the reporting workflow."})
        assert report.status_code == 201
        assert client.get("/api/reports/mine", headers=headers).status_code == 200


def test_moderation_review_and_appeal_workflow():
    with TestClient(app) as client:
        auth = client.post("/api/auth/demo", json={}).json()
        headers = {"Authorization": f"Bearer {auth['access_token']}"}
        post = client.post("/api/posts", headers=headers, json={"content": "Guaranteed cash guaranteed cash guaranteed cash — free money now", "topic": "Business", "format": "Post"})
        assert post.status_code == 201
        item = post.json()["post"]
        if item["status"] == "pending_review":
            queue = client.get("/api/moderation/queue", headers=headers)
            assert queue.status_code == 200
            decision = client.post(f"/api/moderation/posts/{item['id']}/decision", headers=headers, json={"decision": "rejected", "note": "Test policy decision."})
            assert decision.status_code == 200
        else:
            # Also verify that an ordinary user can submit a report for a post.
            report = client.post("/api/reports", headers=headers, json={"target_type": "post", "target_id": item["id"], "reason": "Review request"})
            assert report.status_code == 201


def test_usage_and_protected_review_access():
    with TestClient(app) as client:
        auth = client.post("/api/auth/demo", json={}).json()
        headers = {"Authorization": f"Bearer {auth['access_token']}"}
        started = client.post("/api/usage/start", headers=headers, json={})
        assert started.status_code == 201
        session_id = started.json()["session_id"]
        tick = client.post("/api/usage/tick", headers=headers, json={"session_id": session_id, "active_seconds": 5})
        assert tick.status_code == 200
        assert tick.json()["daily_active_seconds"] >= 5
        assert client.get("/api/profile/summary", headers=headers).status_code == 200
        assert client.get("/api/moderation/queue", headers={}).status_code in (401, 403)


def test_trust_verification_appeal_and_moderator_report_resolution():
    with TestClient(app) as client:
        moderator_payload = client.post("/api/auth/demo", json={}).json()
        moderator_headers = {"Authorization": f"Bearer {moderator_payload['access_token']}"}

        member_payload = client.post("/api/auth/register", json={
            "name": "Review Member",
            "email": f"review-{uuid4().hex[:8]}@example.com",
            "password": "secure-review-pass-82",
        }).json()
        member_headers = {"Authorization": f"Bearer {member_payload['access_token']}"}
        member_id = member_payload["user"]["id"]

        verification = client.post("/api/trust/verification-requests", headers=member_headers, json={
            "verification_type": "creator", "note": "Requesting review of creator account."
        })
        assert verification.status_code == 201
        assert verification.json()["status"] == "pending_review"
        duplicate = client.post("/api/trust/verification-requests", headers=member_headers, json={"verification_type": "creator"})
        assert duplicate.status_code == 409

        post = client.post("/api/posts", headers=member_headers, json={
            "content": "Guaranteed cash guaranteed cash guaranteed cash — free money now",
            "topic": "Business", "format": "Post"
        })
        assert post.status_code == 201
        post_id = post.json()["post"]["id"]
        assert post.json()["post"]["status"] == "pending_review"
        appeal = client.post("/api/appeals", headers=member_headers, json={"post_id": post_id, "reason": "I would like a human reviewer to reconsider this decision."})
        assert appeal.status_code == 201
        assert len(client.get("/api/appeals/mine", headers=member_headers).json()["items"]) == 1

        report = client.post("/api/reports", headers=moderator_headers, json={
            "target_type": "account", "target_id": member_id, "reason": "Account review", "details": "Test review workflow."
        })
        assert report.status_code == 201
        queue = client.get("/api/moderation/queue", headers=moderator_headers)
        assert queue.status_code == 200
        resolved = client.post(f"/api/moderation/reports/{report.json()['id']}/resolve", headers=moderator_headers, json={"note": "Reviewed in API test."})
        assert resolved.status_code == 200 and resolved.json()["status"] == "resolved"


def test_provider_moderation_errors_hold_content_for_review(monkeypatch):
    import backend.app as backend_app

    class FakeResponse:
        def __enter__(self):
            return self
        def __exit__(self, *_args):
            return False
        def read(self):
            return b'{"results":[{"flagged":true,"categories":{"harassment":true},"category_scores":{"harassment":0.91}}]}'

    monkeypatch.setattr(backend_app, "OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(backend_app, "urlopen", lambda *_a, **_k: FakeResponse())
    result = backend_app.moderation_assessment("A test moderation input")
    assert result["engine"] == "openai_moderation_api"
    assert result["status"] == "needs_review"
    assert "Harassment" in result["reasons"]

    def failing_urlopen(*_args, **_kwargs):
        raise TimeoutError("simulated provider timeout")

    monkeypatch.setattr(backend_app, "urlopen", failing_urlopen)
    result = backend_app.moderation_assessment("A test moderation input")
    assert result["engine"] == "provider_unavailable"
    assert result["status"] == "needs_review"


def test_parent_child_link_requires_child_acceptance_and_enforces_settings():
    with TestClient(app) as client:
        parent_payload = client.post("/api/auth/register", json={
            "name": "Parent Test", "email": f"parent-{uuid4().hex[:8]}@example.com", "password": "secure-parent-pass-83"
        }).json()
        child_payload = client.post("/api/auth/register", json={
            "name": "Child Test", "email": f"child-{uuid4().hex[:8]}@example.com", "password": "secure-child-pass-84"
        }).json()
        parent_headers = {"Authorization": f"Bearer {parent_payload['access_token']}"}
        child_headers = {"Authorization": f"Bearer {child_payload['access_token']}"}

        assert client.put("/api/preferences", headers=parent_headers, json={"profile_type": "parent"}).status_code == 200
        child_prefs = client.put("/api/preferences", headers=child_headers, json={"profile_type": "child"})
        assert child_prefs.status_code == 200
        assert child_prefs.json()["preferences"]["child_mode"] is True
        assert child_prefs.json()["preferences"]["allow_external_links"] is False

        request = client.post("/api/family/link-requests", headers=parent_headers, json={"child_email": child_payload["user"]["email"]})
        assert request.status_code == 201, request.text
        link_id = request.json()["link"]["id"]
        assert client.get("/api/family/links", headers=parent_headers).json()["active_children"] == []
        accepted = client.post(f"/api/family/link-requests/{link_id}/respond", headers=child_headers, json={"accept": True})
        assert accepted.status_code == 200 and accepted.json()["link"]["status"] == "active"

        saved = client.put(f"/api/family/children/{child_payload['user']['id']}/settings", headers=parent_headers, json={
            "daily_limit_minutes": 30, "session_limit_minutes": 15, "allow_public_posts": True,
            "allow_external_links": True, "content_restriction_level": "strict", "blocked_topics": ["Gambling"]
        })
        assert saved.status_code == 200, saved.text
        assert saved.json()["preferences"]["allow_external_links"] is False
        assert saved.json()["preferences"]["daily_limit_minutes"] == 30

        blocked = client.post("/api/posts", headers=child_headers, json={"content": "Please read this external resource.", "topic": "Learning", "format": "Link", "image_url": "https://example.com/image.png"})
        assert blocked.status_code == 422
        ordinary = client.post("/api/posts", headers=child_headers, json={"content": "An age-appropriate note about learning science.", "topic": "Learning", "format": "Post"})
        assert ordinary.status_code == 201 and ordinary.json()["post"]["status"] == "pending_review"
        assert client.delete(f"/api/family/links/{link_id}", headers=child_headers).status_code == 200
        assert client.put("/api/preferences", headers=child_headers, json={"profile_type": "standard"}).status_code == 200


def test_phone_verification_development_and_social_interactions():
    with TestClient(app) as client:
        # Local development mode returns an explicitly labelled code; it never claims SMS delivery.
        signup = client.post("/api/auth/register", json={
            "name": "OTP Tester", "email": f"otp-{uuid4().hex[:8]}@example.com",
            "password": "secure-test-pass-93", "phone": f"+1415{uuid4().int % 10000000:07d}"
        })
        assert signup.status_code == 201, signup.text
        result = signup.json()
        assert result["verification_required"] is True
        assert result["delivery_mode"] == "development"
        assert result.get("development_code")
        denied = client.post("/api/auth/login", json={"email": result["email"], "password": "secure-test-pass-93"})
        assert denied.status_code == 403
        verified = client.post("/api/auth/verify-phone", json={"user_id": result["user_id"], "code": result["development_code"]})
        assert verified.status_code == 200, verified.text
        headers = {"Authorization": f"Bearer {verified.json()['access_token']}"}
        post = client.post("/api/posts", headers=headers, json={"content": "A post for persistent social feature tests.", "topic": "Technology", "format": "Post"})
        assert post.status_code == 201, post.text
        post_id = post.json()["post"]["id"]
        comment = client.post(f"/api/posts/{post_id}/comments", headers=headers, json={"content": "A useful comment."})
        assert comment.status_code == 201, comment.text
        comments = client.get(f"/api/posts/{post_id}/comments", headers=headers)
        assert len(comments.json()["items"]) == 1
        saved = client.post(f"/api/posts/{post_id}/save", headers=headers, json={})
        assert saved.status_code == 200 and saved.json()["saved"] is True
        assert any(item["id"] == post_id for item in client.get("/api/posts/saved", headers=headers).json()["items"])


def test_media_upload_validation():
    with TestClient(app) as client:
        auth = client.post("/api/auth/demo", json={}).json()
        headers = {"Authorization": f"Bearer {auth['access_token']}"}
        response = client.post("/api/media/upload", headers=headers, files={"file": ("pixel.png", b"\x89PNG\r\n\x1a\n" + b"demo-bytes", "image/png")})
        assert response.status_code == 201, response.text
        uploaded_file = PROJECT_ROOT / "uploads" / response.json()["filename"]
        try:
            assert response.json()["media_type"] == "image"
        finally:
            uploaded_file.unlink(missing_ok=True)
        invalid = client.post("/api/media/upload", headers=headers, files={"file": ("bad.txt", b"not media", "text/plain")})
        assert invalid.status_code == 415


def test_media_uploads_are_served_and_can_be_published_without_captions():
    with TestClient(app) as client:
        auth = client.post("/api/auth/demo", json={}).json()
        headers = {"Authorization": f"Bearer {auth['access_token']}"}
        uploaded_files = []
        try:
            for name, content_type, media_type, file_bytes, post_format in (
                ("pixel.png", "image/png", "image", b"\x89PNG\r\n\x1a\n" + b"demo-bytes", "Photo"),
                ("clip.mp4", "video/mp4", "video", b"\x00\x00\x00\x18ftypisom" + b"demo-video", "Video"),
            ):
                upload = client.post(
                    "/api/media/upload",
                    headers=headers,
                    files={"file": (name, file_bytes, content_type)},
                )
                assert upload.status_code == 201, upload.text
                media = upload.json()
                uploaded_files.append(PROJECT_ROOT / "uploads" / media["filename"])
                assert media["media_type"] == media_type
                assert client.get(media["url"]).content == file_bytes

                post = client.post("/api/posts", headers=headers, json={
                    "content": "",
                    "topic": "Design",
                    "format": post_format,
                    "image_url": media["url"],
                })
                assert post.status_code == 201, post.text
                assert post.json()["post"]["image_url"] == media["url"]

            empty_text = client.post("/api/posts", headers=headers, json={
                "content": "", "topic": "Design", "format": "Post",
            })
            assert empty_text.status_code == 422
        finally:
            for path in uploaded_files:
                path.unlink(missing_ok=True)


def test_feed_modes_only_show_saved_interests_after_refresh():
    with TestClient(app) as client:
        signup = client.post("/api/auth/register", json={
            "name": "Feed Filter Tester",
            "email": f"feed-filter-{uuid4().hex[:8]}@example.com",
            "password": "secure-feed-filter-pass-84",
        })
        assert signup.status_code == 201, signup.text
        headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}

        for topic in ("Design", "Learning", "Science", "Culture"):
            post = client.post("/api/posts", headers=headers, json={
                "content": f"A thoughtful post about {topic.lower()}.",
                "topic": topic,
                "format": "Post",
            })
            assert post.status_code == 201, post.text

        saved = client.put("/api/preferences", headers=headers, json={
            "interests": ["Design"],
            "blocked_topics": [],
            "study_mode": False,
        })
        assert saved.status_code == 200
        assert saved.json()["preferences"]["interests"] == ["Design"]
        assert client.get("/api/preferences", headers=headers).json()["preferences"]["interests"] == ["Design"]

        for mode in ("for-you", "latest"):
            for _ in range(2):
                feed = client.get(f"/api/feed?mode={mode}", headers=headers)
                assert feed.status_code == 200, feed.text
                assert feed.json()["items"]
                assert {item["topic"] for item in feed.json()["items"]} == {"Design"}

        empty_preferences = client.put("/api/preferences", headers=headers, json={"interests": []})
        assert empty_preferences.status_code == 200
        assert client.get("/api/feed?mode=for-you", headers=headers).json()["items"] == []
        assert client.get("/api/feed?mode=latest", headers=headers).json()["items"] == []

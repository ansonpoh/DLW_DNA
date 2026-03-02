from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from .config import settings
from .models import AccidentEvent

logger = logging.getLogger(__name__)


class EmailNotifier:
    def is_enabled(self) -> bool:
        return settings.email_notifications_enabled

    def _validate_config(self) -> list[str]:
        missing: list[str] = []
        if not settings.email_smtp_host:
            missing.append("EMAIL_SMTP_HOST")
        if not settings.email_from:
            missing.append("EMAIL_FROM")
        if not settings.email_to.strip():
            missing.append("EMAIL_TO")
        return missing

    def _recipients(self) -> list[str]:
        return [email.strip() for email in settings.email_to.split(",") if email.strip()]

    def send_accident_email(self, event: AccidentEvent) -> None:
        if not self.is_enabled():
            return

        missing = self._validate_config()
        if missing:
            logger.warning(
                "Email notification skipped because configuration is incomplete: %s",
                ", ".join(missing),
            )
            return

        recipients = self._recipients()
        if not recipients:
            logger.warning("Email notification skipped because EMAIL_TO has no valid recipients.")
            return

        subject = f"{settings.email_subject_prefix} Accident detected on {event.camera_id}"
        body = (
            "An accident event was detected.\n\n"
            f"camera_id: {event.camera_id}\n"
            f"confidence: {event.confidence:.3f}\n"
            f"detected_at: {event.detected_at.isoformat()}\n"
            f"location_label: {event.location_label or 'N/A'}\n"
            f"latitude: {event.latitude if event.latitude is not None else 'N/A'}\n"
            f"longitude: {event.longitude if event.longitude is not None else 'N/A'}\n"
            f"description: {event.description or 'N/A'}\n"
            f"metadata: {event.metadata}\n"
        )

        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = settings.email_from
        message["To"] = ", ".join(recipients)
        message.set_content(body)

        try:
            with smtplib.SMTP(settings.email_smtp_host, settings.email_smtp_port, timeout=20) as smtp:
                if settings.email_smtp_use_tls:
                    smtp.starttls()
                if settings.email_smtp_username:
                    smtp.login(settings.email_smtp_username, settings.email_smtp_password)
                smtp.send_message(message)
        except Exception:
            logger.exception("Failed to send accident notification email.")
            return

        logger.info(
            "Accident email notification sent camera_id=%s recipients=%s",
            event.camera_id,
            recipients,
        )


email_notifier = EmailNotifier()

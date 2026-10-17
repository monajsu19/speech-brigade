import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_UPDATED, LegalPage } from "../legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Speech Brigade collects, uses, and protects your information.",
  alternates: { canonical: "/privacy/" },
};

export default function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy Policy" subtitle="Your privacy matters to us." updated={LEGAL_UPDATED}>
      <section>
        <h2>1. Introduction</h2>
        <p>
          This Privacy Policy explains how Speech Brigade (&ldquo;Speech Brigade,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
          &ldquo;our&rdquo;) collects, uses, discloses, and safeguards information when you use our website and services
          (collectively, the &ldquo;Service&rdquo;). By accessing or using the Service, you acknowledge that you have read and
          understood this Privacy Policy.
        </p>
        <p>
          If you do not agree with this Policy, please do not use the Service. Capitalized terms not defined here have the
          meanings given in our <Link href="/terms/">Terms of Service</Link>.
        </p>
      </section>

      <section>
        <h2>2. Information We Collect</h2>
        <h3>a. Account Information</h3>
        <p>
          When you create an account, we collect your email address and, if you choose one, a password (stored in hashed
          form by our authentication provider). If you sign in with a one-time email link, we use your email address to send
          it. If you sign in with Google, we receive your email address and basic profile information that Google makes
          available through OAuth.
        </p>
        <h3>b. Tips</h3>
        <p>
          The Service is free. Tips are optional and go toward running and improving Speech Brigade. If you choose to leave a
          tip, it is handled entirely by Buy Me a Coffee on its own website. We
          do not receive or store your payment card details. Your tip is governed by Buy Me a Coffee&rsquo;s terms and privacy
          policy.
        </p>
        <h3>c. Audio Recordings and Transcripts</h3>
        <p>
          When you record a speech with speech analysis or &ldquo;Save recording&rdquo; turned on, the Service records audio from
          your device microphone and uploads the audio file to our storage provider. We generate a text transcript of that
          audio and store metadata such as duration, word count, word-level timing information, detected filler words, the
          event type, and the topic or question you spoke on. You can review and edit the transcript before it is analyzed.
        </p>
        <p>
          If &ldquo;Save recording&rdquo; is turned off, we use the audio only to produce your transcript and feedback, and then
          delete the audio file and its record.
        </p>
        <h3>d. Uploaded Scripts</h3>
        <p>
          If you upload a script (PDF, DOCX, or TXT), its text is read in your browser. The file itself is not
          uploaded; only the text you choose to analyze is sent to the Service for feedback.
        </p>
        <h3>e. LLM-Generated Analysis</h3>
        <p>
          We submit your transcripts and script text to a third-party large language model (LLM) to generate feedback, including
          scores, sentence-level annotations, suggested improvements, and other coaching content. When you save a recording,
          we store this generated output alongside it.
        </p>
        <h3>f. Practice Data</h3>
        <p>
          We store information about your practice, such as the events you practice, the topics you write in &ldquo;My
          Topic,&rdquo; the time you planned and spoke, and your practice history.
        </p>
        <h3>g. Device and Technical Data</h3>
        <p>
          Our servers and service providers may automatically log technical information when you use the Service, such as IP
          address, browser type and version, operating system, referring URLs, access times, and diagnostic data. This
          information is used to operate, secure, and improve the Service.
        </p>
        <h3>h. Cookies and Similar Technologies</h3>
        <p>
          We use strictly necessary cookies and browser storage to keep you signed in, remember settings such as whether to
          save recordings, and return you to the event you had open. We do not use advertising cookies. Our authentication
          provider may set its own cookies under its own privacy policy.
        </p>
      </section>

      <section>
        <h2>3. How We Use Your Information</h2>
        <p>We use the information we collect to:</p>
        <ul>
          <li>Provide, operate, and maintain the Service, including your account and practice history;</li>
          <li>Transcribe and analyze your recordings and scripts to generate LLM-powered feedback;</li>
          <li>Respond to support requests and communicate with you about your account or the Service;</li>
          <li>Detect, investigate, and prevent fraud, abuse, and security incidents;</li>
          <li>Comply with legal obligations and enforce our Terms of Service.</li>
        </ul>
      </section>

      <section>
        <h2>4. Third-Party Service Providers</h2>
        <p>
          We rely on the following service providers to operate the Service. Each provider processes personal information
          under its own privacy policy, and your use of the Service is also subject to their terms as applicable.
        </p>
        <ul>
          <li>
            <strong>Supabase</strong> — Hosts our database, authentication system, and file storage for your audio
            recordings.
          </li>
          <li>
            <strong>Deepgram</strong> — Receives audio recordings to generate transcripts and word-level timing.
          </li>
          <li>
            <strong>Google (Gemini API and Google Sign-In)</strong> — Receives transcripts and script text to generate LLM
            feedback, and, if you choose Google sign-in, handles your sign-in.
          </li>
          <li>
            <strong>Netlify</strong> — Hosts the Speech Brigade website.
          </li>
          <li>
            <strong>Buy Me a Coffee</strong> — Processes optional tips on its own website.
          </li>
        </ul>
        <p>
          We do not sell your personal information, and we do not share it with advertisers or data brokers. We may share
          information with additional processors if needed to operate the Service; if we do, we will update this Policy to
          reflect that.
        </p>
      </section>

      <section>
        <h2>5. What We Do Not Do</h2>
        <ul>
          <li>We do not sell or rent your personal information.</li>
          <li>We do not use your recordings, transcripts, or scripts to train our own LLMs or other models.</li>
          <li>We do not share your recordings with other users.</li>
          <li>We do not use your content for advertising.</li>
        </ul>
        <p>
          Our third-party processors (listed above) handle your data only as needed to perform the services we request from
          them and under their own terms, which may restrict use of customer data for model training. We cannot and do not
          guarantee the data-handling practices of any third party.
        </p>
      </section>

      <section>
        <h2>6. Data Storage and Security</h2>
        <p>
          Your recordings and account data are stored on infrastructure operated by our service providers using
          industry-standard security controls, including encryption in transit and at rest. Access to your account data is
          restricted through row-level security rules.
        </p>
        <p>
          Despite these measures, no system can be guaranteed to be completely secure. We cannot and do not warrant the
          security of any information you transmit to the Service, and you do so at your own risk. Please use a strong,
          unique password and keep your account credentials confidential.
        </p>
      </section>

      <section>
        <h2>7. Data Retention</h2>
        <p>
          We retain your account, saved recordings, transcripts, analyses, topics, and practice data for as long as your
          account is active or as needed to provide the Service, comply with legal obligations, resolve disputes, and enforce
          our agreements.
        </p>
        <p>
          You may request deletion of individual recordings or of your entire account by contacting us using the details
          below; we will process such requests within thirty (30) days, subject to any retention required by law. Anonymized
          or aggregated data that can no longer be linked to you may be retained indefinitely.
        </p>
      </section>

      <section>
        <h2>8. International Data Transfers</h2>
        <p>
          Speech Brigade and our service providers may process and store information in the United States and other countries
          that may have different data protection laws than your country of residence. By using the Service, you consent to
          the transfer of your information to such jurisdictions.
        </p>
      </section>

      <section>
        <h2>9. Your Rights</h2>
        <p>Depending on where you live, you may have the following rights regarding your personal information:</p>
        <ul>
          <li>Access to the personal information we hold about you;</li>
          <li>Correction of inaccurate or incomplete information;</li>
          <li>Deletion of your personal information;</li>
          <li>Objection to, or restriction of, certain processing;</li>
          <li>Portability of your information in a machine-readable format;</li>
          <li>Withdrawal of consent where processing is based on consent;</li>
          <li>The right to lodge a complaint with a supervisory authority.</li>
        </ul>
        <p>
          California residents may have additional rights under the California Consumer Privacy Act (CCPA) and California
          Privacy Rights Act (CPRA), including the right to know what personal information we collect and the right to
          non-discrimination for exercising your rights. To exercise any of these rights, contact us using the details below.
          We may need to verify your identity before responding.
        </p>
      </section>

      <section>
        <h2>10. Students and Children&rsquo;s Privacy</h2>
        <p>
          Speech Brigade is built for high school and college speech and debate students, coaches, and teachers. The Service
          is not intended for children under the age of thirteen (13), and we do not knowingly collect personal information
          from them. If you are under eighteen (18), please use the Service with the permission of a parent or guardian, or as
          part of a school or team activity with your coach&rsquo;s or teacher&rsquo;s guidance.
        </p>
        <p>
          If you believe a child under 13 has provided us with personal information, or a parent or guardian would like their
          student&rsquo;s information deleted, please contact us and we will take steps to delete that information.
        </p>
      </section>

      <section>
        <h2>11. Third-Party Links</h2>
        <p>
          The Service may contain links to third-party websites or services that are not operated by us, such as Buy Me a
          Coffee. This Policy does not apply to those third parties, and we are not responsible for their privacy practices.
          We encourage you to review their privacy policies.
        </p>
      </section>

      <section>
        <h2>12. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. If we make material changes, we will update the &ldquo;Last
          updated&rdquo; date at the top of this page and, where appropriate, notify you through the Service or by email. Your
          continued use of the Service after any update constitutes acceptance of the revised Policy.
        </p>
      </section>

      <section>
        <h2>13. Contact Us</h2>
        <p>
          If you have questions about this Privacy Policy or how we handle your information, contact us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </section>
    </LegalPage>
  );
}

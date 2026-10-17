import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_UPDATED, LegalPage } from "../legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using Speech Brigade.",
  alternates: { canonical: "/terms/" },
};

export default function TermsOfService() {
  return (
    <LegalPage title="Terms of Service" subtitle="Please read these terms carefully." updated={LEGAL_UPDATED}>
      <section>
        <h2>1. Agreement to These Terms</h2>
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) form a legally binding agreement between you (&ldquo;you&rdquo; or
          &ldquo;User&rdquo;) and Speech Brigade (&ldquo;Speech Brigade,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
          &ldquo;our&rdquo;). They govern your access to and use of our website, practice tools, software, and related services
          (collectively, the &ldquo;Service&rdquo;).
        </p>
        <p>
          By creating an account or otherwise using the Service, you represent that you have read, understood, and agree to be
          bound by these Terms and by our <Link href="/privacy/">Privacy Policy</Link>. If you do not agree, do not use the
          Service.
        </p>
      </section>

      <section>
        <h2>2. Eligibility</h2>
        <p>
          You must be at least thirteen (13) years old to use the Service. If you are under eighteen (18), you may use the
          Service only with the permission of a parent or guardian, or as part of a school or team activity supervised by a
          coach or teacher. By using the Service, you represent and warrant that you meet these requirements and that the
          information you provide to us is accurate and current.
        </p>
      </section>

      <section>
        <h2>3. Accounts and Security</h2>
        <p>
          You are responsible for maintaining the confidentiality of your account credentials and for all activities that
          occur under your account. You agree to notify us immediately of any unauthorized use of your account. We are not
          liable for any loss or damage arising from your failure to protect your credentials.
        </p>
        <p>
          You may not create accounts by automated means, impersonate any person or entity, or share your account with
          others.
        </p>
      </section>

      <section>
        <h2>4. Description of the Service</h2>
        <p>
          The Service offers free practice tools for speech and debate, including speaking games, timed practice rounds for
          competitive events such as Impromptu and Extemporaneous Speaking, topic and question prompts, and the option to write
          your own topics. You may record your speeches using your device microphone or upload a script. The Service
          transcribes your recordings and uses a large language model (LLM) to generate feedback, including scores and suggestions
          for improvement.
        </p>
        <p>
          We may add, modify, or discontinue features of the Service at any time without prior notice. The Service is offered
          on an as-available basis.
        </p>
      </section>

      <section>
        <h2>5. Free Service and Optional Tips</h2>
        <p>
          The Service is currently free to use. You may choose to leave a tip to support it; tips go toward running and
          improving Speech Brigade, such as hosting, transcription, and new features. Tips are voluntary, are processed
          by Buy Me a Coffee under its own terms, do not purchase any feature or benefit, and, except as required by
          applicable law, are non-refundable.
        </p>
      </section>

      <section>
        <h2>6. Your Content and License to Us</h2>
        <p>
          &ldquo;User Content&rdquo; means the audio recordings, transcripts (generated automatically from your recordings),
          scripts, topics, and any other material you submit to the Service. You retain ownership of your User Content.
        </p>
        <p>
          By submitting User Content, you grant us a worldwide, non-exclusive, royalty-free, sublicensable license to host,
          store, reproduce, transmit, process, analyze, and create derivative works from that content solely for the purpose of
          operating, providing, maintaining, securing, and improving the Service. This includes transmitting your recordings,
          transcripts, and scripts to our third-party service providers (such as our transcription and LLM analysis providers)
          to generate your feedback.
        </p>
        <p>
          You represent and warrant that (i) you own or have all rights necessary to submit your User Content, (ii) your User
          Content does not infringe any third-party rights or violate any law, and (iii) any other individuals whose voice
          appears in your recordings have consented to your recording and submitting them.
        </p>
      </section>

      <section>
        <h2>7. Acceptable Use</h2>
        <p>You agree not to, and not to allow others to:</p>
        <ul>
          <li>
            Upload content that is unlawful, defamatory, harassing, threatening, hateful, sexually explicit, or that exploits
            or endangers minors;
          </li>
          <li>
            Upload content that infringes any patent, trademark, copyright, trade secret, or other intellectual property or
            proprietary right;
          </li>
          <li>Impersonate any person or misrepresent your affiliation with any person or entity;</li>
          <li>Attempt to gain unauthorized access to the Service, other user accounts, or any connected systems or networks;</li>
          <li>
            Reverse engineer, decompile, scrape, or otherwise attempt to extract source code or underlying data from the
            Service, except as permitted by applicable law;
          </li>
          <li>Interfere with or disrupt the Service, including by introducing malware or by overloading our systems;</li>
          <li>Use the Service to develop, train, or benchmark a competing product or service.</li>
        </ul>
        <p>
          We reserve the right, but have no obligation, to review, remove, or refuse any User Content and to suspend or
          terminate accounts that violate these Terms or that we reasonably believe may create risk or legal exposure for us,
          for other users, or for any third party.
        </p>
      </section>

      <section>
        <h2>8. LLM-Generated Feedback — Not Professional Advice</h2>
        <p>
          Feedback, scores, suggestions, and any other output the Service generates about your speeches are produced in whole
          or in part by automated systems, including large language models (LLMs). This output:
        </p>
        <ul>
          <li>May be inaccurate, incomplete, biased, or inappropriate for your specific context;</li>
          <li>
            Does not constitute professional coaching, judging, medical, psychological, legal, or career advice, and does not
            predict how judges will score you at a tournament;
          </li>
          <li>Should not be relied upon as the sole basis for any important decision.</li>
        </ul>
        <p>
          You are solely responsible for how you interpret and act on any output from the Service. We make no guarantees about
          skill improvement, competition results, or any particular outcome from using the Service.
        </p>
      </section>

      <section>
        <h2>9. Intellectual Property</h2>
        <p>
          The Service, including its software, design, text, graphics, logos, and trademarks, is owned by Speech Brigade or its
          licensors and is protected by applicable intellectual-property laws. Subject to your compliance with these Terms, we
          grant you a limited, personal, non-exclusive, non-transferable, revocable license to access and use the Service for
          your own practice and for non-commercial classroom and team use. No other rights are granted to you, whether by
          implication, estoppel, or otherwise.
        </p>
      </section>

      <section>
        <h2>10. Third-Party Services</h2>
        <p>
          The Service integrates with third-party providers, including Supabase, Deepgram, Google, Netlify, and Buy Me a
          Coffee, as described in our Privacy Policy. Your use of those providers&rsquo; services may be subject to their own
          terms. We are not responsible or liable for the availability, accuracy, or reliability of any third-party service,
          and their acts or omissions are not attributable to us.
        </p>
      </section>

      <section>
        <h2>11. Disclaimers</h2>
        <p>
          <strong>The Service Is Provided &ldquo;As Is&rdquo; and &ldquo;As Available.&rdquo;</strong>
        </p>
        <p>
          To the fullest extent permitted by law, Speech Brigade and its licensors, suppliers, and service providers disclaim
          all warranties, whether express, implied, statutory, or otherwise, including any warranties of merchantability,
          fitness for a particular purpose, title, quiet enjoyment, and non-infringement, and any warranties arising out of
          course of dealing or usage of trade.
        </p>
        <p>
          Without limiting the foregoing, we do not warrant that the Service will meet your requirements, operate
          uninterrupted or error-free, be secure, or that any defects will be corrected. We do not warrant the accuracy,
          reliability, or quality of any LLM-generated feedback or any other content made available through the Service. You
          use the Service at your own risk.
        </p>
      </section>

      <section>
        <h2>12. Limitation of Liability</h2>
        <p>
          To the fullest extent permitted by law, in no event will Speech Brigade or its founders, employees, agents,
          affiliates, licensors, suppliers, or service providers be liable for any indirect, incidental, special,
          consequential, punitive, or exemplary damages, including loss of profits, loss of data, loss of goodwill, business
          interruption, or the cost of substitute services, arising out of or relating to these Terms or the Service, whether
          based on contract, tort (including negligence), strict liability, or any other legal theory, even if we have been
          advised of the possibility of such damages.
        </p>
        <p>
          Our total aggregate liability for any and all claims arising out of or relating to these Terms or the Service will
          not exceed one hundred United States dollars ($100). Some jurisdictions do not allow the exclusion or limitation of
          certain damages, so some of the above limitations may not apply to you; in such cases our liability will be limited
          to the fullest extent permitted by applicable law.
        </p>
      </section>

      <section>
        <h2>13. Indemnification</h2>
        <p>
          You agree to indemnify, defend, and hold harmless Speech Brigade and its founders, employees, agents, affiliates,
          licensors, suppliers, and service providers from and against any claims, damages, liabilities, losses, costs, and
          expenses (including reasonable attorneys&rsquo; fees) arising out of or relating to (i) your use of the Service, (ii)
          your User Content, (iii) your violation of these Terms, or (iv) your violation of any rights of another person or
          entity.
        </p>
      </section>

      <section>
        <h2>14. Termination</h2>
        <p>
          We may suspend or terminate your account and access to the Service at any time, with or without notice, for any
          reason, including if we reasonably believe you have violated these Terms. You may stop using the Service and request
          account deletion at any time.
        </p>
        <p>
          Sections that by their nature should survive termination (including Sections 6, 9, 11, 12, 13, 14, 15, and 17) will
          survive.
        </p>
      </section>

      <section>
        <h2>15. Governing Law and Dispute Resolution</h2>
        <p>
          These Terms and any dispute or claim arising out of or in connection with them or the Service are governed by the
          laws of the State of California, United States, without regard to its conflict of laws principles. You and we agree
          that the exclusive venue for any dispute will be the state and federal courts located in the State of California,
          and each party consents to the personal jurisdiction of such courts.
        </p>
        <p>
          <strong>Informal resolution first.</strong> Before filing any formal claim, you agree to contact us at the email
          address below and attempt in good faith to resolve the dispute informally for at least thirty (30) days.
        </p>
        <p>
          <strong>Class-action waiver.</strong> To the extent permitted by law, you and we each agree that any dispute will be
          resolved only on an individual basis and not as a class, collective, or representative action.
        </p>
      </section>

      <section>
        <h2>16. Changes to These Terms</h2>
        <p>
          We may update these Terms from time to time. If we make material changes, we will update the &ldquo;Last
          updated&rdquo; date at the top of this page and, where appropriate, provide additional notice through the Service or
          by email. Your continued use of the Service after any update constitutes acceptance of the revised Terms. If you do
          not agree to the updated Terms, you must stop using the Service.
        </p>
      </section>

      <section>
        <h2>17. Miscellaneous</h2>
        <p>
          <strong>Entire agreement.</strong> These Terms and the Privacy Policy constitute the entire agreement between you and
          us regarding the Service and supersede all prior understandings.
        </p>
        <p>
          <strong>Severability.</strong> If any provision of these Terms is held unenforceable, the remaining provisions will
          remain in full force and effect.
        </p>
        <p>
          <strong>No waiver.</strong> Our failure to enforce any right or provision is not a waiver of that right or
          provision.
        </p>
        <p>
          <strong>Assignment.</strong> You may not assign or transfer these Terms or your rights under them without our prior
          written consent. We may assign these Terms freely.
        </p>
        <p>
          <strong>Force majeure.</strong> We are not liable for any failure or delay in performance due to causes beyond our
          reasonable control, including natural disasters, acts of war or terrorism, civil disturbances, labor disputes,
          utility or third-party service failures, internet outages, or governmental actions.
        </p>
      </section>

      <section>
        <h2>18. Contact</h2>
        <p>
          Questions about these Terms? Contact us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </section>
    </LegalPage>
  );
}

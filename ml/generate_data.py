"""
DealSense - synthetic data generator.

Creates two SYNTHETIC datasets (no real customer data is used anywhere):
  1. ml/data/leads.csv     ~2,000 lead/call feature rows used to train the lead-scoring model
                           and to power the manager dashboard.
  2. src/data/calls.json   28 timestamped buyer <-> sales call transcripts (English + Hinglish)
                           about a Naigaon-style fully digital launch, replayed in the web app.

Run:  python ml/generate_data.py   (deterministic, seed=18)
"""
import json, math, os, random, re
import numpy as np
import pandas as pd

SEED = 18
rng = np.random.default_rng(SEED)
random.seed(SEED)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FEATURES = [
    "budget_fit", "timeline_urgency", "financing_ready", "plan_interest", "registration_intent",
    "objections_raised", "open_objections", "positive_signals", "negative_signals",
    "buyer_sentiment", "buyer_questions", "is_referral",
]
REPS = ["Nova (AI agent)", "Sneha Iyer", "Rohan Mehta", "Arjun Nair", "Kavya Shah", "Imran Shaikh"]
REP_W = [0.34, 0.15, 0.14, 0.13, 0.12, 0.12]
REP_EFFECT = {"Nova (AI agent)": 0.10, "Sneha Iyer": 0.35, "Rohan Mehta": 0.05, "Arjun Nair": -0.05,
              "Kavya Shah": 0.20, "Imran Shaikh": -0.25}
SOURCES = ["Meta Ads", "Google Search", "99acres", "Housing.com", "Referral", "WhatsApp Campaign"]
SRC_W = [0.30, 0.20, 0.15, 0.12, 0.08, 0.15]
SRC_EFFECT = {"Meta Ads": -0.15, "Google Search": 0.2, "99acres": 0.0, "Housing.com": 0.0,
              "Referral": 0.6, "WhatsApp Campaign": -0.05}
OBJECTIONS = ["refund_999", "possession_delay", "no_sample_flat", "loan_approval", "resale_value",
              "location_connectivity", "builder_trust", "carpet_area", "maintenance_charges", "buyback_terms"]
OBJ_W = np.array([0.13, 0.14, 0.12, 0.13, 0.10, 0.12, 0.07, 0.08, 0.05, 0.06])


def sig(x):
    return 1 / (1 + np.exp(-x))


def make_leads(n=2000):
    rows = []
    for i in range(n):
        rep = rng.choice(REPS, p=REP_W)
        src = rng.choice(SOURCES, p=SRC_W)
        u = rng.normal(0, 1) + 0.5 * SRC_EFFECT[src]            # latent buying intent (unobserved)
        bhk = 1 if rng.random() < 0.58 else 2
        # observed call features, all noisy functions of the latent intent
        r = rng.random()
        budget_fit = 0 if r < 0.14 else (1 if rng.random() < sig(0.9 * u + 0.4) else -1)
        timeline_urgency = int(np.clip(np.round(1.2 + 0.8 * u + rng.normal(0, 0.9)), 0, 3))
        r = rng.random()
        financing_ready = 0 if r < 0.2 else (1 if rng.random() < sig(0.7 * u + 0.2) else -1)
        plan_interest = int(np.clip(rng.poisson(math.exp(0.1 + 0.35 * u)), 0, 3))
        registration_intent = int(rng.random() < sig(1.4 * u - 1.1))
        objections_raised = int(np.clip(rng.poisson(1.6), 0, 5))
        open_objections = int(rng.binomial(objections_raised, sig(-0.9 * u - 0.3))) if objections_raised else 0
        positive_signals = int(np.clip(rng.poisson(math.exp(0.6 + 0.45 * u)), 0, 9))
        negative_signals = int(np.clip(rng.poisson(math.exp(0.1 - 0.5 * u)), 0, 7))
        buyer_sentiment = float(np.round(np.tanh(0.45 * u + rng.normal(0, 0.45)), 3))
        buyer_questions = int(np.clip(rng.poisson(2.5 + 0.6 * max(u, -2)), 0, 10))
        is_referral = int(src == "Referral")
        # ground-truth booking process (with an interaction the linear model can't fully see + noise)
        logit = (-3.45 + 0.65 * budget_fit + 0.40 * timeline_urgency + 0.45 * financing_ready
                 + 0.30 * plan_interest + 1.25 * registration_intent - 0.70 * open_objections
                 + 0.12 * positive_signals - 0.28 * negative_signals + 0.85 * buyer_sentiment
                 + 0.06 * buyer_questions + 0.55 * is_referral
                 + 0.45 * plan_interest * (financing_ready == -1)
                 + 0.35 * u + REP_EFFECT[rep])
        booked = int(rng.random() < sig(logit))
        p_reg = sig(logit + 1.3)
        registered = int(booked or rng.random() < p_reg * 0.55)
        qualified = int(registered or (budget_fit >= 0 and rng.random() < 0.75))
        if objections_raised:
            primary = rng.choice(OBJECTIONS, p=OBJ_W / OBJ_W.sum())
        else:
            primary = "none"
        stage = "Booked (9.9%)" if booked else ("Registered (₹999)" if registered else ("Qualified" if qualified else "Connected"))
        rows.append(dict(
            lead_id=f"L{i+1:04d}", rep=rep, source=src, bhk=bhk, week=int(rng.integers(1, 13)),
            budget_fit=budget_fit, timeline_urgency=timeline_urgency, financing_ready=financing_ready,
            plan_interest=plan_interest, registration_intent=registration_intent,
            objections_raised=objections_raised, open_objections=open_objections,
            positive_signals=positive_signals, negative_signals=negative_signals,
            buyer_sentiment=buyer_sentiment, buyer_questions=buyer_questions, is_referral=is_referral,
            primary_objection=primary, qualified=qualified, registered=registered, booked=booked, stage=stage,
            call_minutes=float(np.round(np.clip(rng.normal(6 + 1.5 * u, 2.5), 1.5, 18), 1)),
        ))
    return pd.DataFrame(rows)


# --------------------------------------------------------------------------------------------
# Call transcripts
# --------------------------------------------------------------------------------------------
BUYERS = [
    ("Rahul Sharma", "en"), ("Neha Kulkarni", "hi"), ("Amit Patil", "hi"), ("Sanjana Rao", "en"),
    ("Vikram Desai", "hi"), ("Pooja Nair", "en"), ("Farhan Qureshi", "hi"), ("Ananya Joshi", "en"),
    ("Suresh Yadav", "hi"), ("Meera Pillai", "en"), ("Karan Malhotra", "hi"), ("Divya Menon", "en"),
    ("Nikhil Jain", "hi"), ("Riya Fernandes", "en"), ("Manoj Gupta", "hi"), ("Shreya Bhatt", "en"),
    ("Aditya Singh", "hi"), ("Lakshmi Iyer", "en"), ("Rakesh Pawar", "hi"), ("Tanvi Shah", "en"),
    ("Deepak Chauhan", "hi"), ("Ishita Banerjee", "en"), ("Prakash More", "hi"), ("Zoya Khan", "en"),
    ("Harish Reddy", "en"), ("Snehal Gaikwad", "hi"), ("Mohit Agarwal", "hi"), ("Kritika Verma", "en"),
]
PERSONAS = ["First-time buyer, renting in Borivali", "Young couple, both working in Andheri",
            "Investor looking for rental yield", "Family upgrading from 1RK in Vasai",
            "NRI buying for parents", "IT professional, works remote 3 days a week",
            "Government employee, close to retirement", "Small business owner from Virar"]

OPEN = {
    "en": ["Hi {b}, this is {a} calling about the Naigaon launch. You registered interest on our website yesterday. Is this a good time to talk?",
           "Good evening {b}, {a} here from the Naigaon homes team. I saw your enquiry come in, do you have five minutes?"],
    "hi": ["Hello {b} ji, main {a} bol rahi hoon Naigaon project se. Aapne website pe enquiry ki thi, abhi baat kar sakte hain?",
           "Namaste {b} ji, {a} here, Naigaon launch team se. Aapka form aaya tha, do minute milenge?"],
}
OPEN_REPLY = {
    "hot": {"en": ["Yes, perfect timing actually. I've been looking at the project page all week.", "Sure, I was hoping someone would call. Go ahead."],
            "hi": ["Haan haan bilkul, main actually wait kar raha tha aapke call ka.", "Haan boliye, mujhe kaafi interest hai is project mein."]},
    "warm": {"en": ["Yes, I have a few minutes. Just exploring options right now.", "Okay, sure. I filled the form to get some details."],
             "hi": ["Haan boliye, abhi bas options dekh raha hoon.", "Theek hai, thoda details chahiye the isliye form bhara."]},
    "cold": {"en": ["I'm a bit busy, but okay, quickly please.", "Honestly I just clicked an ad, but go on."],
             "hi": ["Thoda busy hoon, jaldi bataiye.", "Maine bas ad pe click kiya tha, sach bolun toh."]},
}
DISCOVER = {"en": "Great. Are you looking at a 1BHK or a 2BHK, and roughly what budget do you have in mind?",
            "hi": "Achha, aap 1BHK dekh rahe ho ya 2BHK? Aur budget roughly kitna socha hai?"}
NEEDS = {
    (1, "fit", "en"): ["A 1BHK should be enough for us. Budget is around 36 to 38 lakhs.", "1BHK. I can stretch up to 37 lakhs, not more."],
    (1, "fit", "hi"): ["1BHK chahiye, budget 36-37 lakh tak hai.", "Ek BHK kaafi hai, around 38 lakh ka budget hai."],
    (1, "under", "en"): ["1BHK, but my budget is closer to 28 lakhs honestly.", "Looking for a 1BHK under 30 lakhs."],
    (1, "under", "hi"): ["1BHK, lekin budget 28-30 lakh se zyada nahi hai.", "1BHK chahiye, 30 lakh ke andar."],
    (2, "fit", "en"): ["We need a 2BHK, kids are growing. Budget is about 55 lakhs.", "2BHK, and we have around 60 lakhs set aside."],
    (2, "fit", "hi"): ["2BHK chahiye, family badi hai. Budget 55 lakh tak.", "2BHK, budget 58-60 lakh ke aas paas hai."],
    (2, "under", "en"): ["2BHK ideally, but budget is only around 42 lakhs.", "A 2BHK for 45 lakhs, is that possible?"],
    (2, "under", "hi"): ["2BHK chahiye par budget 42 lakh hi hai.", "45 lakh mein 2BHK mil jayega kya?"],
}
PITCH = {
    1: {"en": "The 1BHK is 323 square feet carpet and starts at ₹34.99 lakh all-inclusive. The best part is the payment plan.",
        "hi": "1BHK 323 sq ft carpet hai, ₹34.99 lakh se start hota hai. Aur payment plan sabse badiya hai."},
    2: {"en": "Our 2BHK starts at ₹52.99 lakh. And the payment plan makes it very easy to start.",
        "hi": "2BHK ₹52.99 lakh se start hai. Aur payment plan se shuru karna bahut easy hai."},
}
PLAN = {"en": "You register with just ₹999, pay 9.9% at booking, 10% after a month, and then only 1% a month until possession. Plus there's a one-year buyback guarantee and a 10-year structural warranty.",
        "hi": "Sirf ₹999 mein registration, booking pe 9.9%, ek mahine baad 10%, phir possession tak sirf 1% per month. Saath mein ek saal ka buyback guarantee aur 10 saal ka structural warranty."}
PLAN_REPLY = {
    "pos": {"en": ["Oh, 1% a month is very manageable, that's less than my rent.", "That payment plan is really interesting. So I don't need the full down payment upfront?"],
            "hi": ["Arre 1% per month toh manageable hai, mera rent bhi isse zyada hai.", "Ye payment plan toh badiya hai, matlab poora down payment ek saath nahi dena?"]},
    "neu": {"en": ["Okay. So 9.9% at booking, then 10% next month. Let me calculate.", "Hmm, the 1% monthly part, how long does that run?"],
            "hi": ["Achha, 9.9% booking pe aur phir 10%. Calculate karna padega.", "1% monthly kitne time tak chalega?"]},
    "neg": {"en": ["Even 1% a month on top of EMI and rent is going to be tough for me.", "9.9% upfront is still a lot of money for me right now."],
            "hi": ["1% monthly bhi rent ke upar bhaari padega mere liye.", "9.9% abhi dena mushkil hai yaar."]},
}
TIMELINE = {
    3: {"en": ["We want to finalise something this month itself.", "Our lease ends in three months, so we need to decide quickly."],
        "hi": ["Is mahine hi kuch final karna hai.", "Teen mahine mein rent agreement khatam ho raha hai, jaldi decide karna hai."]},
    2: {"en": ["Probably in the next 3 to 6 months.", "We're planning to decide within six months."],
        "hi": ["Next 4-5 mahine mein decide karenge.", "Six months ke andar lena hai."]},
    1: {"en": ["Maybe within a year, no hurry.", "Sometime next year, we're still early."],
        "hi": ["Ek saal mein dekhte hain, koi jaldi nahi.", "Next year tak, abhi shuru hi kiya hai dekhna."]},
}
TIMELINE_Q = {"en": "And when are you planning to buy?", "hi": "Aur aap kab tak lena plan kar rahe ho?"}
FIN_Q = {"en": "How are you planning the funding, home loan or self-funded?", "hi": "Funding kaise plan ki hai, home loan ya self-funded?"}
FIN = {
    1: {"en": ["I already have a home loan pre-approval from HDFC.", "Mostly self-funded, we've been saving for this."],
        "hi": ["SBI se loan pre-approved hai already.", "Zyada tar self-funded hai, savings hai humari."]},
    0: {"en": ["Haven't really thought about that yet.", "Probably a loan, I'll check later."],
        "hi": ["Abhi socha nahi hai uske baare mein.", "Shayad loan lunga, baad mein dekhunga."]},
    -1: {"en": ["I'm worried I won't get a loan, my CIBIL score isn't great.", "Loan is my worry, I'm self-employed and banks make it difficult."],
         "hi": ["Loan milega ya nahi wahi tension hai, CIBIL thoda kam hai.", "Self-employed hoon, loan approval ka darr hai."]},
}
OBJ = {
    "refund_999": {"b": {"en": "Is the ₹999 refundable if I change my mind?", "hi": "₹999 refundable hai na agar mann badal gaya toh?"},
                   "a": {"en": "Yes, the ₹999 registration is fully refundable. It only reserves your priority in the allotment.", "hi": "Haan, ₹999 poora refundable hai. Wo bas allotment mein aapki priority lock karta hai."}},
    "possession_delay": {"b": {"en": "What if possession gets delayed? I've heard horror stories.", "hi": "Possession late ho gaya toh? Bahut projects delay hote hain."},
                         "a": {"en": "The project is RERA registered with a committed possession date, and since you only pay 1% a month, your money tracks construction progress.", "hi": "Project RERA registered hai, possession date committed hai. Aur 1% monthly hai toh aapka paisa construction ke saath hi jaata hai."}},
    "no_sample_flat": {"b": {"en": "There's no sample flat or site office? How do I know what I'm buying?", "hi": "Sample flat bhi nahi hai, site office bhi nahi. Kaise pata chalega kya le rahe hain?"},
                       "a": {"en": "We're fully digital, so we've got a 3D walkthrough and a live video tour of the site. And the one-year buyback guarantee means you can exit if you're not happy.", "hi": "Hum fully digital hain, 3D walkthrough aur live video site tour hai. Aur ek saal ka buyback guarantee hai, pasand na aaye toh exit kar sakte ho."}},
    "loan_approval": {"b": {"en": "Will the bank actually approve a loan for this project?", "hi": "Is project pe bank loan dega kya?"},
                      "a": {"en": "It's approved with all major banks, and our loan desk will check your eligibility for free before you pay anything beyond ₹999.", "hi": "Saare bade banks se approved hai, aur humara loan desk free mein eligibility check karega, ₹999 ke alawa kuch dene se pehle."}},
    "resale_value": {"b": {"en": "What about resale value? Naigaon isn't exactly a hot market.", "hi": "Resale value ka kya? Naigaon itna hot market toh nahi hai."},
                     "a": {"en": "The corridor is getting the Virar-Alibaug multimodal corridor and faster rail, and there's the buyback guarantee for the first year as a safety net.", "hi": "Wahan multimodal corridor aur better rail aa raha hai, aur pehle saal buyback guarantee bhi hai safety ke liye."}},
    "location_connectivity": {"b": {"en": "Naigaon feels too far, my office is in Lower Parel. The commute worries me.", "hi": "Naigaon bahut door lagta hai, office Andheri mein hai. Travel ka tension hai."},
                              "a": {"en": "The station is close, and the Western line plus the upcoming coastal road links cut travel time. Many of our buyers commute to Andheri daily.", "hi": "Station paas hai, Western line aur naye road links se time kam hoga. Bahut buyers roz Andheri jaate hain."}},
    "builder_trust": {"b": {"en": "How do I trust a fully online sale? Who is the developer behind this?", "hi": "Online sab hai, trust kaise karein? Developer kaun hai?"},
                      "a": {"en": "It's backed by a large, listed group with decades of delivered projects, and every payment goes to a RERA escrow account.", "hi": "Bade group ka project hai, decades ka delivery record hai, aur har payment RERA escrow account mein jaata hai."}},
    "carpet_area": {"b": {"en": "323 square feet sounds really small for a family.", "hi": "323 sq ft family ke liye chhota nahi hai?"},
                    "a": {"en": "It's efficiently planned with no wasted corridor space, and the 2BHK is there if you need more room.", "hi": "Planning bahut efficient hai, space waste nahi hota. Zyada jagah chahiye toh 2BHK bhi hai."}},
    "maintenance_charges": {"b": {"en": "What will the maintenance charges be every month?", "hi": "Maintenance har mahine kitna aayega?"},
                            "a": {"en": "Maintenance is very reasonable for the area and the first year is covered in the package.", "hi": "Maintenance area ke hisaab se reasonable hai, aur pehla saal package mein covered hai."}},
    "buyback_terms": {"b": {"en": "This buyback guarantee, what's the catch? Do I get my full money back?", "hi": "Buyback guarantee mein catch kya hai? Poora paisa wapas milega?"},
                      "a": {"en": "No catch. Within the first year, the developer buys it back at the price you paid, it's written into your agreement.", "hi": "Koi catch nahi. Pehle saal mein developer aapki price pe hi wapas lega, agreement mein likha hai."}},
}
RESOLVED = {"en": ["Okay, that makes sense.", "Got it, that's reassuring.", "Alright, that helps."],
            "hi": ["Achha theek hai, samajh gaya.", "Haan ye sunke thoda relief hai.", "Ok, ye badiya hai."]}
UNRESOLVED = {"en": ["Hmm, I'm still not convinced about that.", "I don't know, that still worries me."],
              "hi": ["Hmm, abhi bhi pakka nahi hoon.", "Pata nahi, abhi bhi doubt hai."]}
CLOSE = {
    "booked": {"b": {"en": ["Okay, how do I do the ₹999 registration? Send me the link.", "Let's do it. I want to book the unit, what's the next step?"],
                     "hi": ["Theek hai, ₹999 registration ka link bhejo, abhi kar deta hoon.", "Chalo book karte hain, next step kya hai?"]},
               "a": {"en": "Sending the registration link on WhatsApp right now. I'll also block a preferred floor for you.", "hi": "Abhi WhatsApp pe link bhej rahi hoon, aapke liye preferred floor bhi hold kar deti hoon."}},
    "follow_up": {"b": {"en": ["Let me discuss with my family and get back to you this weekend.", "Can you send me the brochure? I'll think about it."],
                        "hi": ["Ghar pe discuss karke weekend tak batata hoon.", "Brochure bhej do, soch ke batata hoon."]},
                  "a": {"en": "Of course. I'll send the brochure and the payment schedule, and call you on Saturday.", "hi": "Bilkul, brochure aur payment schedule bhej deti hoon, Saturday ko call karti hoon."}},
    "lost": {"b": {"en": ["I don't think this is for me, I'll pass for now.", "It's not really in my budget, let's leave it."],
                   "hi": ["Nahi, abhi rehne dete hain, mere liye nahi hai.", "Budget mein nahi hai, chhod dete hain."]},
             "a": {"en": "No problem at all. I'll keep you posted if a new offer comes up.", "hi": "Koi baat nahi, koi naya offer aaya toh zaroor bataungi."}},
}
EXTRA_POS = {"en": ["Which floors are still available?", "Can I see the 3D walkthrough tonight?", "Is the price locked if I register today?"],
             "hi": ["Kaunse floors available hain abhi?", "3D walkthrough aaj dekh sakte hain?", "Aaj register karu toh price lock ho jayega?"]}


MALE_AGENTS = {"Rohan", "Arjun", "Imran"}
FEMALE_BUYERS = {"Neha", "Sanjana", "Pooja", "Ananya", "Meera", "Divya", "Riya", "Shreya", "Lakshmi", "Tanvi",
                 "Ishita", "Zoya", "Snehal", "Kritika"}
TO_M = {"rahi": "raha", "deti": "deta", "karti": "karta", "bataungi": "bataunga"}
TO_F = {"raha": "rahi", "gaya": "gayi", "batata": "batati", "lunga": "lungi", "deta": "deti", "dekhunga": "dekhungi"}


def gender(text, g):
    m = TO_M if g == "m" else TO_F
    return re.sub(r"[A-Za-z]+", lambda w: m.get(w.group(0), w.group(0)), text)


def make_calls():
    calls = []
    outcomes = (["booked"] * 9) + (["follow_up"] * 11) + (["lost"] * 8)
    random.shuffle(outcomes)
    for i, ((buyer, lang), outcome) in enumerate(zip(BUYERS, outcomes)):
        agent = random.choice(["Nova (AI agent)", "Nova (AI agent)", "Sneha Iyer", "Rohan Mehta", "Arjun Nair", "Kavya Shah", "Imran Shaikh"])
        agent_first = agent.split(" ")[0]
        temp = {"booked": "hot", "follow_up": "warm", "lost": "cold"}[outcome]
        if random.random() < 0.2:
            temp = random.choice(["hot", "warm", "cold"])
        bhk = random.choice([1, 1, 2])
        budget = "fit" if (outcome == "booked" or random.random() < 0.55) else "under"
        tl = {"booked": random.choice([3, 3, 2]), "follow_up": random.choice([2, 1, 2]), "lost": random.choice([1, 1, 2])}[outcome]
        fin = {"booked": random.choice([1, 1, 0]), "follow_up": random.choice([0, 1, -1]), "lost": random.choice([-1, 0, -1])}[outcome]
        plan = {"booked": "pos", "follow_up": random.choice(["pos", "neu"]), "lost": random.choice(["neg", "neu"])}[outcome]
        n_obj = random.choice([1, 2, 2, 3])
        objs = random.sample(list(OBJ.keys()), n_obj)
        if fin == -1 and "loan_approval" not in objs and random.random() < 0.5:
            objs[0] = "loan_approval"
        lines = []
        A = lambda t: lines.append(("agent", t))
        B = lambda t: lines.append(("buyer", t))
        first = buyer.split(" ")[0]
        A(random.choice(OPEN[lang]).format(b=first, a=agent_first))
        B(random.choice(OPEN_REPLY[temp][lang]))
        A(DISCOVER[lang])
        B(random.choice(NEEDS[(bhk, budget, lang)]))
        A(PITCH[bhk][lang])
        A(PLAN[lang])
        B(random.choice(PLAN_REPLY[plan][lang]))
        A(TIMELINE_Q[lang]); B(random.choice(TIMELINE[tl][lang]))
        A(FIN_Q[lang]); B(random.choice(FIN[fin][lang]))
        for k, o in enumerate(objs):
            B(OBJ[o]["b"][lang]); A(OBJ[o]["a"][lang])
            resolved = (outcome == "booked") or (outcome == "follow_up" and random.random() < 0.6) or (outcome == "lost" and random.random() < 0.25)
            B(random.choice(RESOLVED[lang] if resolved else UNRESOLVED[lang]))
        if outcome == "booked" or (outcome == "follow_up" and random.random() < 0.5):
            B(random.choice(EXTRA_POS[lang]))
            A({"en": "Good question. I'll share the live availability sheet with you on WhatsApp.",
               "hi": "Achha sawaal hai, live availability sheet WhatsApp pe share karti hoon."}[lang])
        B(random.choice(CLOSE[outcome]["b"][lang])); A(CLOSE[outcome]["a"][lang])
        # fix Hindi verb gender for the speaker
        male_agent = agent_first in MALE_AGENTS
        female_buyer = first in FEMALE_BUYERS
        lines = [(sp, gender(txt, "m") if (sp == "agent" and male_agent) else gender(txt, "f") if (sp == "buyer" and female_buyer) else txt) for sp, txt in lines]
        # timestamps: ~2.6 words/sec + pause
        t = 0.0
        out = []
        for sp, text in lines:
            out.append({"speaker": sp, "text": text, "t": round(t, 1)})
            t += len(text.split()) / 2.6 + random.uniform(0.6, 1.6)
        calls.append({
            "id": f"C{i+1:02d}", "buyer": buyer, "agent": agent, "language": "English" if lang == "en" else "Hinglish",
            "persona": random.choice(PERSONAS), "bhk": bhk,
            "source": random.choice(["Meta Ads", "Google Search", "99acres", "Referral", "WhatsApp Campaign", "Housing.com"]),
            "outcome": outcome, "duration": round(t, 1), "lines": out, "synthetic": True,
        })
    return calls


if __name__ == "__main__":
    os.makedirs(os.path.join(ROOT, "ml", "data"), exist_ok=True)
    df = make_leads()
    df.to_csv(os.path.join(ROOT, "ml", "data", "leads.csv"), index=False)
    # compact column-oriented copy for the in-browser manager dashboard
    with open(os.path.join(ROOT, "src", "data", "leads.json"), "w") as f:
        json.dump({c: df[c].tolist() for c in df.columns}, f, ensure_ascii=False, separators=(",", ":"))
    calls = make_calls()
    with open(os.path.join(ROOT, "src", "data", "calls.json"), "w") as f:
        json.dump(calls, f, ensure_ascii=False, indent=1)
    print(f"leads: {len(df)}  booked rate: {df.booked.mean():.3f}  registered: {df.registered.mean():.3f}")
    print(f"calls: {len(calls)}  outcomes:", pd.Series([c['outcome'] for c in calls]).value_counts().to_dict())

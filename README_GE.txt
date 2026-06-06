Vitrina Photo App — FULL FIX v1.3

ეს ვერსია ასწორებს მთავარ პრობლემას:
ფოტო აიტვირთა, მაგრამ ქვედა სიაში არ ჩანდა და ZIP/WhatsApp ვერ გამოიყენებოდა.

რა შეიცვალა:
1. Google Sheet-ში DateKey თუ ავტომატურად თარიღად გადაიქცა, Apps Script ისევ სწორად კითხულობს.
2. ატვირთვის შემდეგ ფოტო მაშინვე ჩნდება ქვედა სიაში.
3. დაემატა ღილაკი „ყველა ფოტო“.
4. ZIP ჩამოტვირთვა ისევ ინარჩუნებს შენს დარქმეულ სახელებს.
5. WhatsApp-ზე გაგზავნა იმუშავებს ახლად ატვირთულ და მონიშნულ ფოტოებზე.

დაყენება:

A) Apps Script
1. გახსენი Google Sheet → Extensions → Apps Script.
2. Code.gs მთლიანად შეცვალე ამ ZIP-ში არსებული Code.gs-ით.
3. Save.
4. გაუშვი setupProject.
5. Deploy → Manage deployments → Edit.
6. Version აირჩიე New version.
7. Deploy.

B) GitHub
1. GitHub repository-ში შეცვალე ეს 3 ფაილი:
   index.html
   style.css
   script.js
2. დაელოდე 1-2 წუთი.
3. საიტი გახსენი თავიდან.
4. კომპიუტერზე გამოიყენე Ctrl + F5.
5. ტელეფონში გახსენი ახალი ფანჯრით ან გააკეთე refresh.

Web App URL ჩასმულია:
https://script.google.com/macros/s/AKfycbzhxwIXGkoZNGJcuOa6z-M3BDg5TRPdenO6OwJpjlybVtTpPGBdcCd8txpgqBs7V4jF/exec

ტესტი:
1. ჩაწერე TEST001.
2. აირჩიე ერთი ფოტო.
3. დააჭირე ატვირთვას.
4. ფოტო ქვედა სიაში მაშინვე უნდა გამოჩნდეს.
5. მონიშნე ფოტო.
6. სცადე WhatsApp-ზე გაგზავნა ან მონიშნულის ZIP.

შენიშვნა:
WhatsApp-ზე სახელები არ გამოჩნდება, მაგრამ ZIP-ში სახელები შენარჩუნდება.

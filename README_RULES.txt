تعليمات قواعد Firestore
======================
الموقع يستخدم Cloud Firestore والمستند:
learning_resources_app/main

انشر محتوى ملف firestore.rules من:
Firebase Console > Firestore Database > Rules > Publish

التعديل يسمح بقراءة وإنشاء وتحديث المستند المستخدم من الموقع، ولا يفرض قائمة حقول مغلقة على عناصر bookings؛ لذلك يقبل الحقول الجديدة hall وsection.
ملاحظة أمنية: القواعد تتيح الاستخدام العام للمستند لأن الموقع الحالي لا يستخدم Firebase Authentication.

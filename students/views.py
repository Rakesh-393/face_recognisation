from django.shortcuts import render, redirect
from .models import Student
from .forms import StudentForm
from django.http import JsonResponse
import json
import base64
from PIL import Image
from io import BytesIO
from django.views.decorators.csrf import csrf_exempt
import face_recognition
from django.core.files.base import ContentFile





def add_student(request):
    if request.method == 'POST':
        form = StudentForm(request.POST, request.FILES)

        if form.is_valid():
            # Create the student object but don't save to the database yet
            student = form.save(commit=False)
            print(1)
            # Handle the Base64 photo data if it exists
            photo_data = request.POST.get('photo_data')  # Captured photo
            if photo_data:
                # Decode the Base64 image
                format, imgstr = photo_data.split(';base64,')
                ext = format.split('/')[-1]  # Get the file extension (e.g., 'jpeg')
                # Save the photo to the `photo` field
                student.photo.save(f"{student.name}_photo.{ext}", ContentFile(base64.b64decode(imgstr)), save=False)
            print(2)
            # Save the student object to the database
            student.save()
            print(3)
            return redirect('student_list')  # Redirect to the student list page
    else:
        form = StudentForm()

    return render(request, 'add_student.html', {'form': form})

def student_list(request):
    students = Student.objects.all()
    return render(request, 'student_list.html', {'students': students})

# Global variables for face encodings and student data
student_encodings = []
students_data = []

def preload_student_data():
    global student_encodings, students_data
    student_encodings = []  # Clear previous encodings
    students_data = []      # Clear previous student data

    students = Student.objects.all()
    for student in students:
        if student.photo:
            try:
                # Load and encode the student's photo
                image_path = student.photo.path
                student_image = face_recognition.load_image_file(image_path)
                encodings = face_recognition.face_encodings(student_image)
                if len(encodings) > 0:
                    student_encodings.append(encodings[0])
                    students_data.append({
                        "name": student.name,
                        "enrollment_code": student.enrollment_code
                    })
                else:
                    print(f"No face detected for {student.name}. Skipping this entry.")
            except Exception as e:
                print(f"Error processing {student.name}: {e}")

# Preload student data when the server starts
preload_student_data()

@csrf_exempt
def mark_attendance(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            face_data = data.get("image")

            if not face_data:
                return JsonResponse({"error": "No face data provided"}, status=400)

            if face_data.startswith("data:image"):
                face_data = face_data.split(",", 1)[1]

            image_data = base64.b64decode(face_data)
            face_array = face_recognition.load_image_file(BytesIO(image_data))
            input_encodings = face_recognition.face_encodings(face_array)

            if len(input_encodings) == 0:
                return JsonResponse({"error": "No face detected in the image"}, status=400)

            input_encoding = input_encodings[0]

            # Compare encodings
            matches = face_recognition.compare_faces(student_encodings, input_encoding, tolerance=0.6)
            face_distances = face_recognition.face_distance(student_encodings, input_encoding)

            if any(matches):
                best_match_index = face_distances.argmin()
                if matches[best_match_index]:
                    matched_student = students_data[best_match_index]

                    # Update the status to "Present" in the database
                    student = Student.objects.filter(enrollment_code=matched_student["enrollment_code"]).first()
                    if student:
                        student.status = "Present"
                        student.save()

                    return JsonResponse(matched_student)

            return JsonResponse({"error": "No match found"}, status=404)
        except Exception as e:
            return JsonResponse({"error": f"Internal server error: {e}"}, status=500)

    return JsonResponse({"error": "Invalid request method"}, status=405)





def attendance_capture(request):
    return render(request, 'attendance_capture.html')  # Ensure the template name matches

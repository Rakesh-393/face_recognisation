from django.db import models

class Student(models.Model):
    name = models.CharField(max_length=100)
    enrollment_code = models.CharField(max_length=20, unique=True)
    student_class = models.CharField(max_length=20)
    section = models.CharField(max_length=10)
    photo = models.ImageField(upload_to='student_photos/')
    status = models.CharField(
        max_length=10, 
        choices=[('Present', 'Present'), ('Absent', 'Absent')], 
        default='Absent'
    )

    def __str__(self):
        return f"{self.name} ({self.enrollment_code})"



class Attendance(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    date = models.DateField(auto_now_add=True)
    status = models.CharField(max_length=20, default="Present")

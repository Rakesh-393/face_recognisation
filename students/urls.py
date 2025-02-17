from django.urls import path
from . import views

urlpatterns = [
    path('', views.add_student, name='add_student'),
    path('student_list/', views.student_list, name='student_list'),
    path('mark_attendance/', views.mark_attendance, name='mark_attendance'),
    path('attendance_capture/', views.attendance_capture, name='attendance_capture'),
]

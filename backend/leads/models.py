from django.db import models
from django.contrib.auth.models import User

class Lead(models.Model):
    STATUS_CHOICES = [
        ('new', 'New'),
        ('contacted', 'Contacted'),
        ('qualified', 'Qualified'),
        ('proposal', 'Proposal Sent'),
        ('negotiation', 'Negotiation'),
        ('won', 'Won'),
        ('lost', 'Lost'),
    ]
    SOURCE_CHOICES = [
        ('web', 'Website'),
        ('email', 'Email'),
        ('phone', 'Phone'),
        ('social', 'Social Media'),
        ('referral', 'Referral'),
        ('other', 'Other'),
    ]

    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField()
    phone = models.CharField(max_length=20, blank=True, null=True)
    company = models.CharField(max_length=200, blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new')
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='web')
    value = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    assigned_to = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='leads_assigned')
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='leads_created')
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.first_name} {self.last_name} - {self.company or 'No Company'}"

class Deal(models.Model):
    STAGE_CHOICES = [
        ('prospecting', 'Prospecting'),
        ('qualification', 'Qualification'),
        ('proposal', 'Proposal'),
        ('negotiation', 'Negotiation'),
        ('closed_won', 'Closed Won'),
        ('closed_lost', 'Closed Lost'),
    ]
    lead = models.OneToOneField(Lead, on_delete=models.CASCADE, related_name='deal')
    title = models.CharField(max_length=200)
    value = models.DecimalField(max_digits=10, decimal_places=2)
    stage = models.CharField(max_length=20, choices=STAGE_CHOICES, default='prospecting')
    expected_close_date = models.DateField()
    assigned_to = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='deals_assigned')
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='deals_created')
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title
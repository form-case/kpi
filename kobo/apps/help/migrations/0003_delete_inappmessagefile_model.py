# Generated by Django 3.2.15 on 2023-06-06 18:03

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('markdownx_uploader', '0001_initial'),
        ('help', '0002_inappmessage_always_display_as_new'),
    ]

    operations = [
        migrations.DeleteModel(
            name='InAppMessageFile',
        ),
        migrations.CreateModel(
            name='InAppMessageFile',
            fields=[
            ],
            options={
                'proxy': True,
                'indexes': [],
                'constraints': [],
            },
            bases=('markdownx_uploader.markdownxuploaderfile',),
        ),
    ]

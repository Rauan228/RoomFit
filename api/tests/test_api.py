import os, json
from pathlib import Path
os.environ['DATABASE_URL']='sqlite://'
os.environ['COOKIE_SECURE']='false'
os.environ['APP_ENV']='test'
from sqlalchemy.pool import StaticPool
from sqlalchemy import create_engine
import pytest
from fastapi.testclient import TestClient
from roomfit import database, app as module

engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
database.SessionLocal.configure(bind=engine)
module.engine=engine

@pytest.fixture(autouse=True)
def clean():
    database.Base.metadata.drop_all(engine); database.Base.metadata.create_all(engine); module.limits.clear()

@pytest.fixture
def client():
    with TestClient(module.app) as c:
        c.headers['Content-Type']='application/json'
        c.headers['X-CSRF-Token']=c.get('/api/auth/me').json()['csrf']
        yield c

def register(c,email='owner@example.com'):
    result=c.post('/api/auth/register',json={'email':email,'name':'Test Owner','password':'secure-test-password'})
    assert result.status_code==201,result.text
    return result.json()['user']

def doc():return json.loads(Path(__file__).with_name('project.fixture.json').read_text(encoding='utf-8'))
def project(c):return c.post('/api/projects',json={'document':doc()})

def test_registration_session_and_csrf(client):
    assert client.post('/api/auth/register',json={}).status_code==422
    register(client)
    assert client.get('/api/auth/me').json()['user']['email']=='owner@example.com'
    assert client.cookies.get('roomfit_session')
    assert client.post('/api/auth/logout',json={},headers={'X-CSRF-Token':'forged'}).status_code==403
    assert client.post('/api/auth/logout',json={}).status_code==200
    assert client.get('/api/projects').status_code==401
    assert client.post('/api/auth/login',json={'email':'owner@example.com','password':'wrong-password'}).status_code==401
    assert client.post('/api/auth/login',json={'email':'owner@example.com','password':'secure-test-password'}).status_code==200

def test_project_persistence_version_and_history(client):
    register(client); r=project(client); assert r.status_code==201,r.text
    p=r.json(); d=p['document']; d['name']='Updated';
    saved=client.put('/api/projects/'+p['id'],json={'document':d,'version':1}); assert saved.status_code==200,saved.text
    assert saved.json()['version']==2
    assert client.put('/api/projects/'+p['id'],json={'document':d,'version':1}).status_code==409
    assert client.get('/api/projects/'+p['id']).json()['document']==d
    assert len(client.get('/api/projects/'+p['id']+'/versions').json())==2

def test_other_user_and_anonymous_cannot_access_private_project(client):
    register(client); p=project(client).json(); id=p['id']
    with TestClient(module.app) as other:
        other.headers['Content-Type']='application/json'
        other.headers['X-CSRF-Token']=other.get('/api/auth/me').json()['csrf']
        assert other.get('/api/projects/'+id).status_code==401
        register(other,'other@example.com')
        for path in ['', '/versions', '/shares']:
            assert other.get('/api/projects/'+id+path).status_code==404
        assert other.put('/api/projects/'+id,json={'document':doc(),'version':1}).status_code==404
        assert other.delete('/api/projects/'+id).status_code==404
        assert other.get('/api/admin/users').status_code==403

def test_public_share_revocation_and_trash(client):
    register(client); p=project(client).json(); path='/api/projects/'+p['id']
    share=client.post(path+'/shares',json={}).json()
    with TestClient(module.app) as guest:
        assert guest.get('/api/shared/'+share['token']).json()['readOnly'] is True
        assert guest.get(path).status_code==401
        assert guest.put(path,json={'document':doc(),'version':1}).status_code==403
    client.delete(path+'/shares/'+share['id'])
    assert client.get('/api/shared/'+share['token']).status_code==404
    client.delete(path)
    assert client.get(path).status_code==404
    assert len(client.get('/api/projects?state=trash').json())==1
    assert client.post(path+'/restore',json={}).status_code==200
    assert client.get(path).status_code==200

def test_invalid_geometry_and_opening_rejected(client):
    register(client); d=doc(); d['floors'][0]['rooms'][0]['points']=[{'x':0,'y':0},{'x':1000,'y':1000},{'x':0,'y':1000},{'x':1000,'y':0}]
    assert client.post('/api/projects',json={'document':d}).status_code==422
    d=doc(); d['schemaVersion']=7
    assert client.post('/api/projects',json={'document':d}).status_code==422
    d=doc(); d['floors'][0]['openings']=[{'id':database.uid(),'wallId':database.uid(),'kind':'door','offset':0,'width':800,'height':2100,'sill':0,'flip':False,'inward':True}]
    assert client.post('/api/projects',json={'document':d}).status_code==422

def test_password_change_and_account_delete(client):
    register(client); project(client)
    assert client.post('/api/auth/password',json={'currentPassword':'wrong','password':'updated-password'}).status_code==400
    assert client.post('/api/auth/password',json={'currentPassword':'secure-test-password','password':'updated-password'}).status_code==200
    assert client.request('DELETE','/api/profile',json={'currentPassword':'wrong'}).status_code==400
    assert client.request('DELETE','/api/profile',json={'currentPassword':'updated-password'}).status_code==200
    assert client.get('/api/auth/me').json()['user'] is None

def test_personal_furniture_owner_and_catalog_validation(client):
    register(client)
    c={'id':'custom','name':'Desk','type':'custom','category':'Own','width':1200,'depth':600,'height':750,'color':'#123456','clearance':0,'tags':[]}
    f=client.post('/api/furniture',json=c); assert f.status_code==201,f.text
    c['width']=-1; assert client.post('/api/furniture',json=c).status_code==422
    with TestClient(module.app) as other:
        other.headers['Content-Type']='application/json'
        other.headers['X-CSRF-Token']=other.get('/api/auth/me').json()['csrf'];register(other,'other@example.com')
        assert other.get('/api/furniture').json()==[]
        assert other.delete('/api/furniture/'+f.json()['id']).status_code==404

def test_auth_errors_never_echo_password(client):
    secret='sensitive-value'
    r=client.post('/api/auth/register',json={'email':'invalid','password':secret,'name':'x'})
    assert secret not in r.text

def test_password_reset_is_one_time_and_invalidates_sessions(client,monkeypatch):
    register(client);sent=[]
    monkeypatch.setenv('SMTP_HOST','test.invalid')
    monkeypatch.setattr(module,'send_reset',lambda email,token:sent.append(token))
    assert client.post('/api/auth/forgot',json={'email':'owner@example.com'}).status_code==200
    assert sent
    assert client.post('/api/auth/reset',json={'token':sent[0],'password':'reset-secure-password'}).status_code==200
    assert client.get('/api/auth/me').json()['user'] is None
    assert client.post('/api/auth/reset',json={'token':sent[0],'password':'reset-secure-password'}).status_code==400
    assert client.post('/api/auth/login',json={'email':'owner@example.com','password':'reset-secure-password'}).status_code==200

def test_forged_underlay_invalid_shopping_and_duplicate_room_rejected(client):
    register(client);d=doc();d['floors'][0]['underlay']={'src':'data:image/png;base64,YmFk','x':0,'y':0,'width':1000,'height':1000,'opacity':.5}
    assert client.post('/api/projects',json={'document':d}).status_code==422
    d=doc();d['floors'][0]['rooms'].append(d['floors'][0]['rooms'][0].copy())
    assert client.post('/api/projects',json={'document':d}).status_code==422

def test_admin_limits_templates_and_audit(client):
    u=register(client)
    with database.SessionLocal() as s:
        admin=s.get(database.User,u['id']);admin.role='admin';s.commit()
    assert client.put('/api/admin/limits',json={'projects':1}).status_code==200
    assert project(client).status_code==201
    assert project(client).status_code==409
    t={'name':'My template','document':doc()}
    assert client.put('/api/admin/templates/custom',json=t).status_code==200
    assert any(v['id']=='custom' for v in client.get('/api/templates').json())
    assert client.delete('/api/admin/templates/custom').status_code==200
    assert any(v['action']=='template.update' for v in client.get('/api/admin/audit').json())

def test_project_rename_conflict_and_support(client):
    register(client);p=project(client).json();path='/api/projects/'+p['id']
    assert client.patch(path,json={'name':'New','version':1}).status_code==200
    assert client.patch(path,json={'name':'Old','version':1}).status_code==409
    assert client.post('/api/support',json={'text':'Help with my room please'}).status_code==201
    assert client.get('/api/admin/support').status_code==403

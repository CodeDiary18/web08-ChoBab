import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { useSocketStore } from '@store/socket';
import { useMeetLocationStore, useRestaurantListLayerStatusStore } from '@store/index';

import { ReactComponent as CandidateListIcon } from '@assets/images/candidate-list.svg';
import { ReactComponent as ListIcon } from '@assets/images/list-icon.svg';
import { ReactComponent as MapIcon } from '@assets/images/map-icon.svg';
import { ReactComponent as MapLocationIcon } from '@assets/images/map-location.svg';

import ActiveUserInfo from '@components/ActiveUserInfo';
import LinkShareButton from '@components/LinkShareButton';
import MainMap from '@components/MainMap';

import { NAVER_LAT, NAVER_LNG } from '@constants/map';
import { RESTAURANT_LIST_TYPES } from '@constants/modal';
import { URL_PATH } from '@constants/url';

import useCurrentLocation from '@hooks/useCurrentLocation';
import RestaurantListLayer from '@components/RestaurantListLayer';
import RestaurantDetailLayer from '@components/RestaurantDetailLayer';
import Category from '@components/Category';
import LoadingScreen from '@components/LoadingScreen';
import RestaurantPreview from '@components/RestaurantPreview';
import MapController from '@components/MapController';

import { RoomService } from '@apis/module/room';

import {
  ButtonInnerTextBox,
  CandidateListButton,
  CategoryBox,
  Header,
  HeaderBox,
  MainPageLayout,
  MapOrListButton,
  FooterBox,
  ControllerBox,
} from './styles';

function MainPage() {
  const navigate = useNavigate();

  const { roomCode } = useParams<{ roomCode: string }>();

  const socketRef = useRef<Socket | null>(null);

  const { setSocket } = useSocketStore((state) => state);
  const { getCurrentLocation, updateUserLocation } = useCurrentLocation();
  const { updateMeetLocation } = useMeetLocationStore();

  const [isRoomConnect, setRoomConnect] = useState<boolean>(false);
  const [myId, setMyId] = useState<string>('');
  const [myName, setMyName] = useState<string>('');
  const [joinList, setJoinList] = useState<Map<UserIdType, UserType>>(new Map());
  const [restaurantData, setRestaurantData] = useState<RestaurantType[]>([]);

  const { restaurantListLayerStatus, updateRestaurantListLayerStatus } =
    useRestaurantListLayerStatusStore((state) => state);

  const isMap = () => {
    return restaurantListLayerStatus === RESTAURANT_LIST_TYPES.hidden;
  };

  const isRestaurantFilteredList = () => {
    return restaurantListLayerStatus === RESTAURANT_LIST_TYPES.filtered;
  };

  const isRestaurantCandidateList = () => {
    return restaurantListLayerStatus === RESTAURANT_LIST_TYPES.candidate;
  };

  const handleSwitchCandidateList = () => {
    if (isMap() || isRestaurantFilteredList()) {
      updateRestaurantListLayerStatus(RESTAURANT_LIST_TYPES.candidate);
      return;
    }

    updateRestaurantListLayerStatus(RESTAURANT_LIST_TYPES.hidden);
  };

  const handleSwitchRestaurantList = () => {
    if (isMap() || isRestaurantCandidateList()) {
      updateRestaurantListLayerStatus(RESTAURANT_LIST_TYPES.filtered);
      return;
    }

    updateRestaurantListLayerStatus(RESTAURANT_LIST_TYPES.hidden);
  };

  const convertArrayToMapByUserId = (userList: JoinListType): Map<UserIdType, UserType> => {
    const joinUserList = new Map<UserIdType, UserType>();

    Object.keys(userList).forEach((userIdInRoom) => {
      const userInfo = userList[userIdInRoom];
      joinUserList.set(userInfo.userId, userInfo);
    });

    return joinUserList;
  };

  const initSocket = () => {
    socketRef.current = io('/room');

    const socket = socketRef.current;

    setSocket(socket);

    socket.on('connect', () => {
      socket.emit('connectRoom', { roomCode, userLat: NAVER_LAT, userLng: NAVER_LNG });
    });

    socket.on('connect_error', () => {
      navigate(URL_PATH.INTERNAL_SERVER_ERROR);
    });

    socket.on('connectResult', async (response: ResTemplateType<RoomDataType>) => {
      if (!response.data) {
        navigate(URL_PATH.INTERNAL_SERVER_ERROR);
        return;
      }

      const { lat, lng, userList, restaurantList, userId, userName } = response.data;

      setMyId(userId);
      setMyName(userName);
      setJoinList(convertArrayToMapByUserId(userList));
      setRestaurantData(restaurantList);
      updateMeetLocation({ lat, lng });

      setRoomConnect(true);

      const location = await getCurrentLocation();
      socket.emit('changeMyLocation', { userLat: location.lat, userLng: location.lng });
      updateUserLocation(location);
    });
  };

  const initService = async () => {
    try {
      if (!roomCode) {
        throw new Error('입장하고자 하는 방의 코드가 존재하지 않습니다.');
      }

      /**
       * connect 순서 매우 중요
       * 세션 객체 생성을 위해 rest api 가 먼저 호출되어야 한다.
       */
      const isRoomValid = await RoomService.validRoom(roomCode);

      if (!isRoomValid) {
        throw new Error('입장하고자 하는 방이 올바르지 않습니다.');
      }

      initSocket();
    } catch (error: any) {
      if (error.response.status === 500) {
        navigate(URL_PATH.INTERNAL_SERVER_ERROR);
        return;
      }

      navigate(URL_PATH.INVALID_ROOM);
    }
  };

  useEffect(() => {
    initService();

    return () => {
      const socket = socketRef.current;

      if (!(socket instanceof Socket)) {
        return;
      }

      socket.close();
    };
  }, []);

  return !isRoomConnect ? (
    <LoadingScreen size="large" message="모임방 입장 중..." />
  ) : (
    <MainPageLayout>
      <MainMap restaurantData={restaurantData} joinList={joinList} />
      <HeaderBox>
        <Header>
          <ActiveUserInfo
            myId={myId}
            myName={myName}
            socketRef={socketRef}
            joinList={joinList}
            setJoinList={setJoinList}
          />
          <LinkShareButton />
        </Header>
      </HeaderBox>

      <CategoryBox>
        <Category />
      </CategoryBox>

      <FooterBox>
        <ControllerBox>
          {/* 식당 후보 목록 <-> 지도 화면 */}
          {/* 식당 후보 목록 <-- 전체 식당 목록 */}
          <CandidateListButton onClick={handleSwitchCandidateList}>
            {isRestaurantCandidateList() ? <MapLocationIcon /> : <CandidateListIcon />}
          </CandidateListButton>

          {/* 전체 식당 목록 <-> 지도 화면 */}
          {/* 전체 식당 목록 <-- 식당 후보 목록 */}
          <MapOrListButton onClick={handleSwitchRestaurantList}>
            {isRestaurantFilteredList() ? <MapIcon /> : <ListIcon />}
            <ButtonInnerTextBox>
              {isRestaurantFilteredList() ? '지도보기' : '목록보기'}
            </ButtonInnerTextBox>
          </MapOrListButton>

          {/* 지도 컨트롤러 */}
          <MapController />
        </ControllerBox>

        <RestaurantPreview />
      </FooterBox>

      {/* 식당 리스트 & 식당 상세정보 Full-Screen 모달 컴포넌트 */}
      <RestaurantListLayer restaurantData={restaurantData} />
      <RestaurantDetailLayer />
    </MainPageLayout>
  );
}

export default MainPage;
